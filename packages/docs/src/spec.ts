import { honoScanner } from "./hono/scanner.ts"
import type { RouteScanner } from "./scanner.ts"
import type {
  InfoObject,
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  PathsObject,
  ResponsesObject,
  RouteEntry,
  SchemaObject,
} from "./types.ts"

function isArkType(value: unknown): boolean {
  return typeof value === "function" && "toJsonSchema" in value
}

export function toOpenAPISchema(schema: unknown): SchemaObject {
  if (schema === null || schema === undefined) return {}

  if (isArkType(schema)) {
    try {
      return (schema as unknown as { toJsonSchema(): Record<string, unknown> }).toJsonSchema()
    } catch (err) {
      console.warn("[peta-docs] schema conversion failed:", err instanceof Error ? err.message : err)
      return {}
    }
  }

  if (typeof schema === "object" && !Array.isArray(schema)) {
    return schema as SchemaObject
  }

  return {}
}

function mapContentSchemas(
  content: Record<string, { schema: unknown }>,
  convert: (schema: unknown) => SchemaObject,
): Record<string, { schema: SchemaObject }> {
  const result: Record<string, { schema: SchemaObject }> = {}
  for (const [mediaType, { schema }] of Object.entries(content)) {
    result[mediaType] = { schema: convert(schema) }
  }
  return result
}

// ---------------------------------------------------------------------------
// Status code → default description map
// ---------------------------------------------------------------------------
const STATUS_DESCRIPTIONS = {
  "200": "OK",
  "201": "Created",
  "202": "Accepted",
  "204": "No Content",
  "301": "Moved Permanently",
  "304": "Not Modified",
  "400": "Bad Request",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Not Found",
  "405": "Method Not Allowed",
  "409": "Conflict",
  "422": "Unprocessable Entity",
  "429": "Too Many Requests",
  "500": "Internal Server Error",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
} as const satisfies Record<string, string>

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------
function normalizeResponse(
  status: string,
  value: unknown,
): { description: string; content?: Record<string, { schema: unknown }> } {
  if (typeof value === "string") {
    return { description: value }
  }
  if (isArkType(value)) {
    return {
      description: (STATUS_DESCRIPTIONS as Record<string, string | undefined>)[status] ?? status,
      content: { "application/json": { schema: value } },
    }
  }
  const obj = value as Record<string, unknown>
  return {
    description:
      (obj.description as string) ?? (STATUS_DESCRIPTIONS as Record<string, string | undefined>)[status] ?? status,
    ...(obj.content ? { content: obj.content as Record<string, { schema: unknown }> } : {}),
  }
}

// ---------------------------------------------------------------------------
// Request body normalization
// ---------------------------------------------------------------------------
function normalizeRequestBody(value: unknown):
  | {
      description?: string
      required?: boolean
      content: Record<string, { schema: unknown }>
    }
  | undefined {
  if (value === null || value === undefined) return undefined
  if (isArkType(value)) {
    return {
      required: true,
      content: { "application/json": { schema: value } },
    }
  }
  return value as {
    description?: string
    required?: boolean
    content: Record<string, { schema: unknown }>
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function honoPathToOpenAPI(path: string): string {
  return path.replace(/:(\w+)/g, "{$1}")
}

function parsePathParams(path: string): string[] {
  const params: string[] = []
  const regex = /{(\w+)}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(path)) !== null) {
    params.push(match[1]!)
  }
  return params
}

function extractProperties(schema: SchemaObject): Array<{ name: string; schema: SchemaObject; required: boolean }> {
  const props = schema.properties as Record<string, unknown> | undefined
  if (!props) return []

  const requiredSet = new Set<string>(Array.isArray(schema.required) ? (schema.required as string[]) : [])

  return Object.entries(props).map(([name, propSchema]) => ({
    name,
    schema: propSchema as SchemaObject,
    required: requiredSet.has(name),
  }))
}

function autoOperationId(method: string, path: string): string {
  const cleanPath = path
    .replace(/{(\w+)}/g, (_m, name) => `By${name[0]!.toUpperCase() + name.slice(1)}`)
    .replace(/:(\w+)/g, (_m, name) => `By${name[0]!.toUpperCase() + name.slice(1)}`)
    .replace(/\/+/g, "/")
    .replace(/^\//, "")
  const segments = cleanPath.split("/").filter(Boolean)
  return method.toLowerCase() + segments.map((s) => s[0]!.toUpperCase() + s.slice(1)).join("")
}

function autoTags(path: string, basePath?: string): string[] {
  const stripped = basePath && path.startsWith(basePath) ? path.slice(basePath.length) : path
  const segment = stripped.replace(/^\//, "").split("/").filter(Boolean)[0]
  if (!segment || segment.startsWith(":") || segment.startsWith("{")) return []
  return [segment]
}

// ---------------------------------------------------------------------------
// Spec builder
// ---------------------------------------------------------------------------
const METHOD_ORDER: Record<string, number> = {
  get: 0,
  post: 1,
  put: 2,
  delete: 3,
  patch: 4,
}

export function buildOpenAPISpec(
  routes: RouteEntry[],
  info: InfoObject,
  options?: { basePath?: string; components?: Record<string, unknown> },
): OpenAPIObject {
  const basePath = options?.basePath ?? "/api"
  const s = (schema: unknown) => toOpenAPISchema(schema)
  const paths: PathsObject = {}

  const tagged = routes
    .map((r) => ({
      ...r,
      tag: (r.config.tags ?? autoTags(r.path, basePath))[0] ?? "__untagged",
    }))
    .sort((a, b) => {
      if (a.tag !== b.tag) return a.tag < b.tag ? -1 : 1
      if (a.path !== b.path) return a.path < b.path ? -1 : 1
      return (METHOD_ORDER[a.method.toLowerCase()] ?? 99) - (METHOD_ORDER[b.method.toLowerCase()] ?? 99)
    })

  for (const { path: rawPath, method, config } of tagged) {
    const path = honoPathToOpenAPI(rawPath)
    const pathItem = (paths[path] ??= {})

    const parameters: ParameterObject[] = []

    const pathParams = parsePathParams(path)
    if (pathParams.length > 0 && config.params) {
      const paramsSchema = s(config.params)
      const paramDefs = extractProperties(paramsSchema)
      for (const param of pathParams) {
        const def = paramDefs.find((p) => p.name === param)
        parameters.push({
          name: param,
          in: "path",
          required: true,
          schema: def?.schema ?? { type: "string" },
        })
      }
    }

    if (config.query) {
      const querySchema = s(config.query)
      for (const param of extractProperties(querySchema)) {
        parameters.push({
          name: param.name,
          in: "query",
          required: param.required,
          schema: param.schema,
        })
      }
    }

    if (config.pagination) {
      parameters.push(
        {
          name: "page",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            minimum: 1,
            default: 1,
            description: "Page number",
          },
        },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: {
            type: "integer",
            minimum: 1,
            maximum: config.pagination.maxLimit,
            default: config.pagination.defaultLimit,
            description: "Items per page",
          },
        },
      )
    }

    if (config.filters) {
      for (const filter of config.filters) {
        for (const op of filter.operators) {
          const paramName = op === "eq" ? filter.name : `${filter.name}__${op}`
          const schemaObj = s(filter.schema)
          if (op === "in") {
            schemaObj["x-operator"] = "in"
          }
          parameters.push({
            name: paramName,
            in: "query",
            required: false,
            schema: schemaObj,
          })
        }
      }
    }

    if (config.sort) {
      const enumValues = config.sort.flatMap((f: string) => [f, `-${f}`])
      parameters.push({
        name: "sort",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: enumValues,
          description: "Comma-separated sort fields. Prefix with - for descending.",
        },
      })
    }

    if (config.include) {
      parameters.push({
        name: "include",
        in: "query",
        required: false,
        schema: {
          type: "string",
          enum: config.include,
          description: "Comma-separated related resources to sideload.",
        },
      })
    }

    if (config.fieldsets) {
      for (const resource of config.fieldsets) {
        parameters.push({
          name: `fields[${resource}]`,
          in: "query",
          required: false,
          schema: {
            type: "string",
            description: `Fields to return for ${resource}.`,
          },
        })
      }
    }

    if (config.headers) {
      const headersSchema = s(config.headers)
      for (const param of extractProperties(headersSchema)) {
        parameters.push({
          name: param.name,
          in: "header",
          required: param.required,
          schema: param.schema,
        })
      }
    }

    const operation: OperationObject = {
      operationId: config.operationId ?? autoOperationId(method, path),
    }
    if (config.summary) operation.summary = config.summary
    if (config.description) operation.description = config.description
    if (config.tags) operation.tags = config.tags
    else operation.tags = autoTags(path, basePath)
    if (config.security) {
      operation.security = config.security.map((s) => ({ [s]: [] }))
    }
    if (parameters.length > 0) operation.parameters = parameters

    if (config.requestBody) {
      const normalized = normalizeRequestBody(config.requestBody)
      if (normalized) {
        operation.requestBody = {
          description: normalized.description,
          required: normalized.required,
          content: mapContentSchemas(normalized.content, s),
        }
      }
    }

    const responses: ResponsesObject = {}
    for (const [status, rawResponse] of Object.entries(config.responses)) {
      const normalized = normalizeResponse(status, rawResponse)
      const resp: {
        description: string
        content?: Record<string, { schema: SchemaObject }>
      } = {
        description: normalized.description,
      }
      if (normalized.content) {
        resp.content = mapContentSchemas(normalized.content, s)
      }
      responses[status] = resp
    }
    operation.responses = responses

    const methodLower = method.toLowerCase()
    const validMethods = ["get", "post", "put", "delete", "patch"] as const satisfies readonly (keyof PathItemObject)[]
    const key = validMethods.includes(methodLower as (typeof validMethods)[number])
      ? (methodLower as (typeof validMethods)[number])
      : undefined
    if (key) {
      pathItem[key] = operation
    }
  }

  const spec: OpenAPIObject = {
    openapi: "3.1.0",
    info,
    paths,
  }
  if (options?.components) {
    spec.components = options.components
  }
  return spec
}

export function getOpenAPISpec(
  app: unknown,
  info: InfoObject,
  scanner?: RouteScanner,
  options?: { basePath?: string; components?: Record<string, unknown> },
): OpenAPIObject {
  return buildOpenAPISpec((scanner ?? honoScanner).scan(app), info, options)
}

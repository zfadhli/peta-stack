import { emitDiagnostic } from "../lib/diagnostics.ts"
import type { SchemaObject } from "../types.ts"

// ---------------------------------------------------------------------------
// Schema conversion
// ---------------------------------------------------------------------------

function isArkType(value: unknown): boolean {
  return typeof value === "function" && "toJsonSchema" in value
}

export function toOpenAPISchema(schema: unknown): SchemaObject {
  if (schema === null || schema === undefined) return {}

  if (isArkType(schema)) {
    try {
      return (schema as unknown as { toJsonSchema(): Record<string, unknown> }).toJsonSchema()
    } catch {
      // Fall back to the input type, which strips morphs/undefined unions —
      // this is what OpenAPI should document (the client-facing wire format).
      try {
        const inner = (schema as unknown as { in?: { toJsonSchema(): Record<string, unknown> } }).in
        if (inner?.toJsonSchema) return inner.toJsonSchema()
      } catch {
        // If even the input type can't be converted, return a placeholder
      }
      return {}
    }
  }

  if (typeof schema === "function") {
    const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development"
    const msg =
      "[peta-docs] A non-ArkType function was passed where a schema is expected. " +
      "OpenAPI spec generation only supports ArkType types and plain JSON Schema objects. " +
      "Either use an ArkType type, or pre-convert your schema to a JSON Schema object."
    emitDiagnostic({
      level: "warn",
      message: msg,
      code: "SCHEMA_NOT_ARKTYPE",
      source: "toOpenAPISchema",
    })
    if (isDev) throw new TypeError(msg)
    return {}
  }

  if (typeof schema === "object" && !Array.isArray(schema)) {
    return schema as SchemaObject
  }

  return {}
}

export function mapContentSchemas(
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
export function normalizeResponse(
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
      (obj.description as string) ??
      (STATUS_DESCRIPTIONS as Record<string, string | undefined>)[status] ??
      status,
    ...(obj.content ? { content: obj.content as Record<string, { schema: unknown }> } : {}),
  }
}

// ---------------------------------------------------------------------------
// Request body normalization
// ---------------------------------------------------------------------------
export function normalizeRequestBody(value: unknown):
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

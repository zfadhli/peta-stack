type ArkTypeResult = { issues?: Iterable<unknown>; value?: unknown } | Iterable<unknown>

export interface ArkTypeSchema {
  toJsonSchema(): unknown
  infer: unknown
  "~standard": {
    validate: (v: unknown) => ArkTypeResult | Promise<ArkTypeResult>
  }
}

export type Pagination = {
  page: number
  limit: number
  offset: number
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "gte"
  | "gt"
  | "lte"
  | "lt"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"

export interface FilterDef {
  name: string
  schema: ArkTypeSchema
  operators: FilterOperator[]
}

export type FilterFields<
  N extends string,
  S extends ArkTypeSchema,
  O extends FilterOperator[],
> = ("eq" extends O[number] ? { [K in N]?: S["infer"] } : Record<string, unknown>) & {
  [K in `${N}__${Extract<O[number], Exclude<FilterOperator, "eq">>}`]?: S["infer"]
}

export type FieldsetParams<R extends string[]> = {
  [K in R[number] as `fields[${K}]`]?: string
}

type HonoContext = import("hono").Context

export type TypedContext<
  B,
  Q,
  P,
  Hd,
  Pg extends Pagination | undefined = undefined,
  F = Record<string, unknown>,
  Sr = Record<string, unknown>,
  Ir = Record<string, unknown>,
  Fs = Record<string, unknown>,
> = Omit<HonoContext, "req"> & {
  req: Omit<HonoContext["req"], "valid"> & {
    valid: {
      (type: "json"): [B] extends [ArkTypeSchema] ? B["infer"] : never
      (
        type: "query",
      ): [Q] extends [ArkTypeSchema]
        ? Pg extends Pagination
          ? Q["infer"] & Pg & F & Sr & Ir & Fs
          : Q["infer"] & F & Sr & Ir & Fs
        : Pg extends Pagination
          ? Pg & F & Sr & Ir & Fs
          : F & Sr & Ir & Fs
      (type: "param"): [P] extends [ArkTypeSchema] ? P["infer"] : never
      (type: "header"): [Hd] extends [ArkTypeSchema] ? Hd["infer"] : never
    }
  }
}

export type SchemaObject = Record<string, unknown>

export interface InfoObject {
  title: string
  version: string
  description?: string
  summary?: string
}

export interface ServerObject {
  url: string
  description?: string
}

export interface ParameterObject {
  name: string
  in: "query" | "path" | "header" | "cookie"
  description?: string
  required?: boolean
  deprecated?: boolean
  style?: string
  explode?: boolean
  schema: SchemaObject
}

export interface MediaTypeObject {
  schema: SchemaObject
}

export interface RequestBodyObject {
  description?: string
  required?: boolean
  content: Record<string, MediaTypeObject>
}

export interface ResponseObject {
  description: string
  content?: Record<string, MediaTypeObject>
}

export type ResponsesObject = Record<string, ResponseObject>

export interface OperationObject {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  parameters?: ParameterObject[]
  requestBody?: RequestBodyObject
  responses?: ResponsesObject
  deprecated?: boolean
  security?: Record<string, string[]>[]
}

export interface PathItemObject {
  summary?: string
  description?: string
  get?: OperationObject
  post?: OperationObject
  put?: OperationObject
  delete?: OperationObject
  patch?: OperationObject
  parameters?: ParameterObject[]
}

export type PathsObject = Record<string, PathItemObject>

export interface OpenAPIObject {
  openapi: string
  info: InfoObject
  jsonSchemaDialect?: string
  servers?: ServerObject[]
  paths?: PathsObject
  components?: Record<string, unknown>
  security?: Record<string, string[]>[]
  tags?: { name: string; description?: string }[]
}

export type StatusCode =
  | "200"
  | "201"
  | "202"
  | "204"
  | "301"
  | "304"
  | "400"
  | "401"
  | "403"
  | "404"
  | "405"
  | "409"
  | "422"
  | "429"
  | "500"
  | "502"
  | "503"
  | (string & {})

export type ResponseValue =
  | string
  | { description?: string; content?: Record<string, { schema: unknown }> }

export interface RouteConfig {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  deprecated?: boolean
  query?: unknown
  params?: unknown
  headers?: unknown
  requestBody?:
    | unknown
    | {
        description?: string
        required?: boolean
        content: Record<string, { schema: unknown }>
      }
  pagination?: { maxLimit: number; defaultLimit: number }
  filters?: FilterDef[]
  sort?: string[]
  include?: string[]
  fieldsets?: string[]
  security?: string[]
  responses: Partial<Record<StatusCode, ResponseValue>>
  handler: (...args: unknown[]) => unknown
}

export interface RouteEntry {
  path: string
  method: string
  config: RouteConfig
}

export interface RouteScanner {
  scan(app: unknown): RouteEntry[]
}

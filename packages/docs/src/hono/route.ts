import type { Context, MiddlewareHandler, Next } from "hono"
import { validator } from "hono/validator"
import type {
  ArkTypeSchema,
  FieldsetParams,
  FilterDef,
  FilterFields,
  FilterOperator,
  Pagination,
  RouteConfig,
  TypedContext,
} from "../types.ts"

const OPENAPI_META = Symbol("openapi-meta")

interface HandlerWithMeta {
  [OPENAPI_META]?: RouteConfig
}

// ---------------------------------------------------------------------------
// Pagination options
// ---------------------------------------------------------------------------
export interface PaginationOptions {
  maxLimit?: number
  defaultLimit?: number
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parse a comma-separated string into a trimmed, non-empty array. */
function parseCommaSeparated(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []
}

// ---------------------------------------------------------------------------
// Shared Standard Schema validation helper
// ---------------------------------------------------------------------------

/**
 * Validate a value against a Standard Schema.
 * Returns the validated value, or calls `onError` and returns a Response.
 */
async function validateOrError<T>(
  schema: ArkTypeSchema,
  value: unknown,
  c: Context,
  onError: ValidationErrorHandler,
): Promise<T | Response> {
  const result = await schema["~standard"].validate(value)
  if (Array.isArray(result)) return onError(result, c)
  const r = result as { issues?: Iterable<unknown>; value?: unknown }
  if (r.issues) return onError([...r.issues], c)
  if ("value" in r && r.value !== undefined) return r.value as T
  return value as T
}

// ---------------------------------------------------------------------------
// Validation error handler — customize the response on validation failure
// ---------------------------------------------------------------------------
export type ValidationErrorHandler = (issues: unknown[], c: Context) => Response | Promise<Response>

let onValidationError: ValidationErrorHandler = (issues, c) => {
  return c.json({ error: "Validation failed", issues }, 400)
}

/** @deprecated Use {@link RouteBuilder.onValidationError} on the route chain instead. Per-route handlers take precedence over the global handler. */
export function setOnValidationError(handler: ValidationErrorHandler): () => void {
  const prev = onValidationError
  onValidationError = handler
  return () => {
    onValidationError = prev
  }
}

// ---------------------------------------------------------------------------
// Response validation error handler — customize the response on response
// validation failure (handler returned data that doesn't match the schema)
// ---------------------------------------------------------------------------
const onResponseValidationError: ValidationErrorHandler = (issues, c) => {
  return c.json({ error: "Response validation failed", issues }, 500)
}

/** @internal */
export function createValidator(
  target: "json" | "query" | "param" | "header",
  schema: ArkTypeSchema,
  onError: ValidationErrorHandler,
): MiddlewareHandler {
  return validator(target, async (value, c) => {
    const validated = await validateOrError(schema, value, c, onError)
    if (validated instanceof Response) return validated
    return validated
  })
}

/* ─── Auth guard factory ─────────────────────────────────────────────── */

/**
 * Creates a middleware that checks for the presence of auth credentials.
 *
 * This is a mechanism-level guard — it verifies that the expected auth
 * header/cookie exists, but does NOT verify the credential itself
 * (e.g., JWT validity, session data). The app's own middleware or
 * handler is responsible for identity verification.
 */
function authGuard(schemes: string[]): MiddlewareHandler {
  return async (c, next) => {
    for (const scheme of schemes) {
      if (scheme === "bearerAuth") {
        if (!c.req.header("Authorization")?.startsWith("Bearer ")) {
          return c.json({ error: "unauthorized" }, 401)
        }
      }
      if (scheme === "sessionAuth" || scheme === "cookieAuth") {
        if (!c.req.header("Cookie")?.includes("session=")) {
          return c.json({ error: "unauthorized" }, 401)
        }
      }
      // Extensible: add "apiKey", "basicAuth", etc. here
    }
    return await next()
  }
}

// ---------------------------------------------------------------------------
// RouteBuilder — fluent chain API
// ---------------------------------------------------------------------------
export class RouteBuilder<
  B = undefined,
  Q = undefined,
  P = undefined,
  Hd = undefined,
  Pg extends Pagination | undefined = undefined,
  F = Record<string, unknown>,
  Sr = Record<string, unknown>,
  Ir = Record<string, unknown>,
  Fs = Record<string, unknown>,
> {
  private _config: {
    summary?: string
    description?: string
    operationId?: string
    tags?: string[]
    deprecated?: boolean
    requestBody?: ArkTypeSchema
    query?: ArkTypeSchema
    params?: ArkTypeSchema
    headers?: ArkTypeSchema
    pagination?: { maxLimit: number; defaultLimit: number }
    filters?: FilterDef[]
    sort?: string[]
    include?: string[]
    fieldsets?: string[]
    security?: string[]
    responses: Record<string, ArkTypeSchema | string | Record<string, unknown>>
    onValidationError?: ValidationErrorHandler
    onResponseValidationError?: ValidationErrorHandler
  } = { responses: {} }

  private static readonly VALIDATOR_MAP = [
    ["requestBody", "json"] as const,
    ["params", "param"] as const,
    ["headers", "header"] as const,
  ] as const

  summary(s: string): this {
    this._config.summary = s
    return this
  }

  description(s: string): this {
    this._config.description = s
    return this
  }

  operationId(s: string): this {
    this._config.operationId = s
    return this
  }

  tags(...t: string[]): this {
    this._config.tags = t
    return this
  }

  deprecated(d = true): this {
    this._config.deprecated = d
    return this
  }

  requestBody<S extends ArkTypeSchema>(schema: S): RouteBuilder<S, Q, P, Hd, Pg, F, Sr, Ir, Fs> {
    this._config.requestBody = schema
    return this as unknown as RouteBuilder<S, Q, P, Hd, Pg, F, Sr, Ir, Fs>
  }

  query<S extends ArkTypeSchema>(schema: S): RouteBuilder<B, S, P, Hd, Pg, F, Sr, Ir, Fs> {
    this._config.query = schema
    return this as unknown as RouteBuilder<B, S, P, Hd, Pg, F, Sr, Ir, Fs>
  }

  params<S extends ArkTypeSchema>(schema: S): RouteBuilder<B, Q, S, Hd, Pg, F, Sr, Ir, Fs> {
    this._config.params = schema
    return this as unknown as RouteBuilder<B, Q, S, Hd, Pg, F, Sr, Ir, Fs>
  }

  headers<S extends ArkTypeSchema>(schema: S): RouteBuilder<B, Q, P, S, Pg, F, Sr, Ir, Fs> {
    this._config.headers = schema
    return this as unknown as RouteBuilder<B, Q, P, S, Pg, F, Sr, Ir, Fs>
  }

  response(status: number | string, value: ArkTypeSchema | string | Record<string, unknown>): this {
    this._config.responses[String(status)] = value
    return this
  }

  auth(scheme = "bearerAuth"): this {
    const acc = this._config.security ?? []
    acc.push(scheme)
    this._config.security = acc
    return this
  }

  filter<N extends string, S extends ArkTypeSchema, O extends FilterOperator[] = ["eq"]>(
    name: N,
    schema: S,
    options?: { operators?: O },
  ): RouteBuilder<B, Q, P, Hd, Pg, F & FilterFields<N, S, O>, Sr, Ir, Fs> {
    const acc = this._config.filters ?? []
    acc.push({
      name,
      schema,
      operators: (options?.operators ?? ["eq"]) as FilterOperator[],
    })
    this._config.filters = acc
    return this as unknown as RouteBuilder<B, Q, P, Hd, Pg, F & FilterFields<N, S, O>, Sr, Ir, Fs>
  }

  sort(fields: string[]): RouteBuilder<B, Q, P, Hd, Pg, F, { sort?: string[] }, Ir, Fs> {
    this._config.sort = fields
    return this as unknown as RouteBuilder<B, Q, P, Hd, Pg, F, { sort?: string[] }, Ir, Fs>
  }

  include(relations: string[]): RouteBuilder<B, Q, P, Hd, Pg, F, Sr, { include?: string[] }, Fs> {
    this._config.include = relations
    return this as unknown as RouteBuilder<B, Q, P, Hd, Pg, F, Sr, { include?: string[] }, Fs>
  }

  fieldsets<R extends string[]>(resources: R): RouteBuilder<B, Q, P, Hd, Pg, F, Sr, Ir, FieldsetParams<R>> {
    this._config.fieldsets = resources
    return this as unknown as RouteBuilder<B, Q, P, Hd, Pg, F, Sr, Ir, FieldsetParams<R>>
  }

  onValidationError(handler: ValidationErrorHandler): this {
    this._config.onValidationError = handler
    return this
  }

  onResponseValidationError(handler: ValidationErrorHandler): this {
    this._config.onResponseValidationError = handler
    return this
  }

  paginated(options?: PaginationOptions): RouteBuilder<B, Q, P, Hd, Pagination, F, Sr, Ir, Fs> {
    this._config.pagination = {
      maxLimit: options?.maxLimit ?? 100,
      defaultLimit: options?.defaultLimit ?? 20,
    }
    return this as unknown as RouteBuilder<B, Q, P, Hd, Pagination, F, Sr, Ir, Fs>
  }

  handle(
    handler: (c: TypedContext<B, Q, P, Hd, Pg, F, Sr, Ir, Fs>) => Response | Promise<Response>,
  ): MiddlewareHandler {
    const onError = this._config.onValidationError ?? onValidationError
    const validators = this.buildValidators(onError)

    // Inject auth guard at the front of the middleware chain
    // so that auth is checked before any other validation runs.
    if (this._config.security?.length) {
      validators.unshift(authGuard(this._config.security))
    }

    const routeConfig = this.buildRouteConfig(handler as (...args: unknown[]) => unknown)
    const wrapped = this.composeHandler(validators, handler)
    return this.attachRouteMeta(wrapped, routeConfig)
  }

  private buildValidators(onError: ValidationErrorHandler): MiddlewareHandler[] {
    const validators: MiddlewareHandler[] = []

    const querySchema = this._config.query as ArkTypeSchema | undefined
    const filters = this._config.filters
    const sortFields = this._config.sort
    const includeFields = this._config.include
    const fieldsetResources = this._config.fieldsets
    const pag = this._config.pagination
    if (querySchema || filters?.length || sortFields || includeFields || fieldsetResources || pag) {
      validators.push(
        validator("query", async (value, c) => {
          let merged: Record<string, unknown> = {}
          const raw = value as Record<string, string | undefined>

          if (querySchema) {
            const validated = await validateOrError<Record<string, unknown>>(querySchema, value, c, onError)
            if (validated instanceof Response) return validated
            merged = { ...merged, ...validated }
          }

          if (filters) {
            for (const filter of filters) {
              for (const op of filter.operators) {
                const paramName = op === "eq" ? filter.name : `${filter.name}__${op}`
                const val = raw[paramName]
                if (val === undefined) continue

                if (op === "in") {
                  const items = parseCommaSeparated(val)
                  const validatedItems: unknown[] = []
                  for (const item of items) {
                    const validated = await validateOrError(filter.schema, item, c, onError)
                    if (validated instanceof Response) return validated
                    validatedItems.push(validated)
                  }
                  merged[paramName] = validatedItems
                } else {
                  const validated = await validateOrError(filter.schema, val, c, onError)
                  if (validated instanceof Response) return validated
                  merged[paramName] = validated
                }
              }
            }
          }

          if (sortFields) {
            const sortVal = raw.sort
            if (sortVal !== undefined) {
              const parts = parseCommaSeparated(sortVal)
              const allowed = new Set(sortFields.flatMap((f: string) => [f, `-${f}`]))
              for (const part of parts) {
                if (!allowed.has(part)) {
                  return onError([{ message: `Invalid sort field "${part}". Allowed: ${[...allowed].join(", ")}` }], c)
                }
              }
              merged.sort = parts
            }
          }

          const includeFields = this._config.include
          if (includeFields) {
            const rawInclude = raw.include
            if (rawInclude !== undefined) {
              const parts = parseCommaSeparated(rawInclude)
              const allowed = new Set(includeFields)
              for (const part of parts) {
                if (!allowed.has(part)) {
                  return onError([{ message: `Invalid include "${part}". Allowed: ${[...allowed].join(", ")}` }], c)
                }
              }
              merged.include = parts
            }
          }

          const fieldsetResources = this._config.fieldsets
          if (fieldsetResources) {
            for (const resource of fieldsetResources) {
              const paramName = `fields[${resource}]`
              const val = raw[paramName]
              if (val !== undefined && typeof val !== "string") {
                return onError([{ message: `"${paramName}" must be a string` }], c)
              }
              if (val !== undefined) merged[paramName] = val
            }
          }

          if (pag) {
            const page = Math.floor(Number(raw.page ?? "1"))
            const limit = Math.min(pag.maxLimit, Math.max(1, Math.floor(Number(raw.limit ?? String(pag.defaultLimit)))))
            merged.page = Number.isFinite(page) && page >= 1 ? page : 1
            merged.limit = Number.isFinite(limit) ? limit : pag.defaultLimit
            merged.offset = ((merged.page as number) - 1) * (merged.limit as number)
          }

          return merged
        }),
      )
    }

    for (const [key, target] of RouteBuilder.VALIDATOR_MAP) {
      const schema = this._config[key]
      if (schema != null) {
        validators.push(createValidator(target, schema, onError))
      }
    }
    return validators
  }

  private buildRouteConfig(handler: (...args: unknown[]) => unknown): RouteConfig {
    return {
      ...this._config,
      responses: this._config.responses as RouteConfig["responses"],
      pagination: this._config.pagination,
      filters: this._config.filters,
      sort: this._config.sort,
      include: this._config.include,
      fieldsets: this._config.fieldsets,
      security: this._config.security,
      handler,
    }
  }

  private composeHandler(
    validators: MiddlewareHandler[],
    handler: (c: TypedContext<B, Q, P, Hd, Pg, F, Sr, Ir, Fs>) => Response | Promise<Response>,
  ): MiddlewareHandler {
    return async (c: Context, _next: Next): Promise<Response | undefined> => {
      const run = async (i: number): Promise<Response | undefined> => {
        if (i < validators.length) {
          const result = await validators[i]!(c, run.bind(null, i + 1) as unknown as Next)
          return result ?? undefined
        }
        const response = (await handler(c as unknown as TypedContext<B, Q, P, Hd, Pg, F, Sr, Ir, Fs>)) ?? undefined
        if (response) {
          const onError = this._config.onResponseValidationError ?? onResponseValidationError
          return (await this.validateResponse(response, c, onError)) ?? undefined
        }
        return response
      }
      return run(0)
    }
  }

  private async validateResponse(response: Response, c: Context, onError: ValidationErrorHandler): Promise<Response> {
    // Only validate JSON responses with a body
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) return response
    if (response.status === 204) return response

    const schema = this._config.responses[String(response.status)]
    if (!schema || (typeof schema !== "object" && typeof schema !== "function") || !("~standard" in schema))
      return response

    try {
      const cloned = response.clone()
      const body = await cloned.json()
      const validated = await validateOrError(schema as ArkTypeSchema, body, c, onError)
      if (validated instanceof Response) return validated
      return response
    } catch {
      // Body couldn't be parsed as JSON — skip validation
      return response
    }
  }

  private attachRouteMeta(handler: MiddlewareHandler, config: RouteConfig): MiddlewareHandler {
    Object.defineProperty(handler, OPENAPI_META, {
      value: config,
      writable: false,
    })
    return handler
  }
}

export function route<
  B = undefined,
  Q = undefined,
  P = undefined,
  Hd = undefined,
  Pg extends Pagination | undefined = undefined,
  F = Record<string, unknown>,
  Sr = Record<string, unknown>,
  Ir = Record<string, unknown>,
  Fs = Record<string, unknown>,
>(): RouteBuilder<B, Q, P, Hd, Pg, F, Sr, Ir, Fs> {
  return new RouteBuilder<B, Q, P, Hd, Pg, F, Sr, Ir, Fs>()
}

export function getRouteMeta(handler: unknown): RouteConfig | undefined {
  if (typeof handler !== "function") return undefined
  return (handler as HandlerWithMeta)[OPENAPI_META]
}

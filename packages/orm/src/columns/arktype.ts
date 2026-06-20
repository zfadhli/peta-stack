import { type as arktype } from "arktype"
import { ValidationError } from "../errors.js"
import type { Constraint, SchemaConfig } from "./schema.js"

export function createArkTypeSchemaConfig(): SchemaConfig {
  function compile(dataType: string, args: unknown[], constraints: Constraint[]): unknown {
    const def = buildDef(dataType, args, constraints)
    return (arktype as (def: string) => unknown)(def)
  }
  function formatProblems(result: unknown): string {
    const raw = (result as Record<string, unknown>).flatProblemsByPath as
      | Record<string, string[]>
      | undefined
    if (!raw) return "Validation failed"
    return Object.entries(raw)
      .map(([path, msgs]) => `${path}: ${msgs.join(", ")}`)
      .join("; ")
  }
  function parse<T>(schema: unknown, value: unknown): T {
    const result = (schema as (v: unknown) => unknown)(value)
    if (result instanceof arktype.errors) {
      throw new ValidationError(formatProblems(result))
    }
    return result as T
  }
  function assert<T>(schema: unknown, value: unknown): T {
    const t = schema as { assert: (v: unknown) => T }
    try {
      return t.assert(value)
    } catch (e: unknown) {
      if (isArkError(e)) {
        throw new ValidationError(formatProblems(e.arkErrors))
      }
      throw e
    }
  }
  return { compile, parse, assert }
}

function buildDef(dataType: string, args: unknown[], constraints: Constraint[]): string {
  let lower: number | undefined,
    upper: number | undefined,
    nullable = false,
    hasEmail = false,
    hasUrl = false,
    pattern: string | undefined
  for (const c of constraints) {
    switch (c.type) {
      case "min":
        lower = c.args[0] as number
        break
      case "max":
        upper = c.args[0] as number
        break
      case "email":
        hasEmail = true
        break
      case "url":
        hasUrl = true
        break
      case "pattern":
        pattern = c.args[0] as string
        break
      case "nullable":
        nullable = true
        break
    }
  }
  let def = ""
  const typeName = typeNameFor(dataType, args)
  const sub = subTypeModifier(dataType, hasEmail, hasUrl)
  const typeWithSub = typeName + sub
  if (lower !== undefined && upper !== undefined) def += `${lower} <= ${typeWithSub} <= ${upper}`
  else {
    def += typeWithSub
    if (lower !== undefined) def += ` >= ${lower}`
    if (upper !== undefined) def += ` <= ${upper}`
  }
  if (pattern) def += ` & /${pattern}/`
  if (nullable) def += " | null"
  return def
}

function typeNameFor(dataType: string, args: unknown[]): string {
  switch (dataType) {
    case "integer":
    case "smallint":
    case "bigint":
      return "number.integer"
    case "float":
    case "double":
    case "decimal":
      return "number"
    case "string":
    case "varchar":
    case "text":
      return "string"
    case "boolean":
      return "boolean"
    case "timestamp":
    case "date":
      return "string.date.iso"
    case "json":
    case "jsonb":
      return "unknown"
    case "uuid":
      return "string.uuid"
    case "enum":
      return (args as string[]).map((v) => JSON.stringify(v)).join(" | ")
    default:
      return "unknown"
  }
}

function subTypeModifier(dataType: string, hasEmail: boolean, hasUrl: boolean): string {
  if (dataType !== "string" && dataType !== "varchar" && dataType !== "text") return ""
  if (hasEmail) return ".email"
  if (hasUrl) return ".url"
  return ""
}

interface ArkErrorLike {
  arkErrors?: unknown
}
function isArkError(e: unknown): e is ArkErrorLike {
  return typeof e === "object" && e !== null && "arkErrors" in e
}

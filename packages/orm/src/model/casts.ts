import type { ModelConfig } from "./types.js"

export function castValue(value: unknown, type: string): unknown {
  if (value == null) return value
  switch (type) {
    case "json":
    case "object":
      return typeof value === "string" ? JSON.parse(value as string) : value
    case "boolean":
    case "bool":
      return Boolean(value)
    case "integer":
    case "int":
      return Number(value)
    case "float":
    case "double":
      return Number(value)
    case "date":
    case "datetime":
      return typeof value === "string" ? value : (value as Date).toISOString()
    default:
      return value
  }
}

export function prepareForDb(value: unknown, type: string): unknown {
  if (value == null) return value
  switch (type) {
    case "json":
    case "object":
      return typeof value === "string" ? value : JSON.stringify(value)
    case "boolean":
    case "bool":
      return value ? 1 : 0
    default:
      return value
  }
}

export function castForSet(value: unknown, type: string): unknown {
  if (value == null) return value
  switch (type) {
    case "json":
    case "object":
      return typeof value === "string" ? JSON.parse(value as string) : value
    case "boolean":
    case "bool":
      return Boolean(value)
    case "integer":
    case "int":
      return Number(value)
    default:
      return value
  }
}

export function applyCastsToData(
  config: ModelConfig,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!config.casts) return { ...data }
  const result: Record<string, unknown> = { ...data }
  for (const [key, type] of Object.entries(config.casts)) {
    if (key in result) {
      result[key] = castValue(result[key], type)
    }
  }
  return result
}

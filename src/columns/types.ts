import type { Column } from "./column.js"
import { createColumn } from "./column.js"
import type { SchemaConfig } from "./schema.js"

export interface ColumnTypes {
  integer: () => Column<number>
  smallint: () => Column<number>
  bigint: () => Column<number>
  string: (maxLength?: number) => Column<string>
  text: () => Column<string>
  boolean: () => Column<boolean>
  timestamp: () => Column<string>
  date: () => Column<string>
  json: <T = unknown>() => Column<T>
  jsonb: <T = unknown>() => Column<T>
  float: () => Column<number>
  double: () => Column<number>
  decimal: (precision?: number, scale?: number) => Column<number>
  uuid: () => Column<string>
  enum: <T extends string>(...values: T[]) => Column<T>
  timestamps: () => { createdAt: Column<string>; updatedAt: Column<string> }
}

export function t(config: { schema: SchemaConfig }): ColumnTypes {
  const schema = config.schema
  function col<T>(dataType: string, args?: unknown[]): Column<T> {
    return createColumn<T>(schema, dataType, args)
  }
  return {
    integer: () => col<number>("integer"),
    smallint: () => col<number>("smallint"),
    bigint: () => col<number>("bigint"),
    string: (maxLength?: number) =>
      maxLength !== undefined ? col<string>("string", [maxLength]) : col<string>("string"),
    text: () => col<string>("text"),
    boolean: () => col<boolean>("boolean"),
    timestamp: () => col<string>("timestamp"),
    date: () => col<string>("date"),
    json: <T = unknown>() => col<T>("json"),
    jsonb: <T = unknown>() => col<T>("jsonb"),
    float: () => col<number>("float"),
    double: () => col<number>("double"),
    decimal: (precision?: number, scale?: number) =>
      precision !== undefined ? col<number>("decimal", [precision, scale ?? 0]) : col<number>("decimal"),
    uuid: () => col<string>("uuid"),
    enum: <T extends string>(...values: T[]) => col<T>("enum", values),
    timestamps: () => ({
      createdAt: col<string>("timestamp").default(() => new Date().toISOString()),
      updatedAt: col<string>("timestamp").default(() => new Date().toISOString()),
    }),
  }
}

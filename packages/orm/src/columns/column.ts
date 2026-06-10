import type { Constraint, SchemaConfig } from "./schema.js"

export interface Column<out T = unknown> {
  readonly arkType: unknown
  readonly dataType: string
  readonly args: readonly unknown[]
  readonly constraints: readonly Constraint[]
  readonly isNullable: boolean
  readonly isPrimaryKey: boolean
  readonly isUnique: boolean
  readonly defaultValue: unknown
  hasConstraint(type: string): boolean
  parse(value: unknown): T
  assert(value: unknown): T
  primaryKey(): Column<T>
  nullable(): Column<T | null>
  default<V>(value: V): Column<T>
  unique(): Column<T>
  index(): Column<T>
  min(n: number): Column<T>
  max(n: number): Column<T>
  email(): Column<T>
  url(): Column<T>
  pattern(regex: RegExp | string): Column<T>
  references(table: () => unknown, columns: string[]): Column<T>
}

export function createColumn<T>(
  schema: SchemaConfig,
  dataType: string,
  args: unknown[] = [],
  constraints: Constraint[] = [],
): Column<T> {
  let compiled: unknown | null = null

  function withConstraint(type: string, extraArgs: unknown[] = []): never {
    return createColumn<T>(schema, dataType, args, [...constraints, { type, args: extraArgs }]) as never
  }

  const col: Column<T> = {
    get arkType(): unknown {
      if (compiled === null) compiled = schema.compile(dataType, args, constraints)
      return compiled
    },
    get dataType(): string {
      return dataType
    },
    get args(): readonly unknown[] {
      return args
    },
    get constraints(): readonly Constraint[] {
      return constraints
    },
    get isNullable(): boolean {
      return constraints.some((c) => c.type === "nullable")
    },
    get isPrimaryKey(): boolean {
      return constraints.some((c) => c.type === "primaryKey")
    },
    get isUnique(): boolean {
      return constraints.some((c) => c.type === "unique")
    },
    get defaultValue(): unknown {
      const c = constraints.find((c) => c.type === "default")
      if (!c) return undefined
      const val = c.args[0]
      return typeof val === "function" ? val : val
    },
    hasConstraint(type: string): boolean {
      return constraints.some((c) => c.type === type)
    },
    parse(value: unknown): T {
      return schema.parse<T>(col.arkType, value)
    },
    assert(value: unknown): T {
      return schema.assert<T>(col.arkType, value)
    },
    primaryKey(): Column<T> {
      return withConstraint("primaryKey")
    },
    nullable(): Column<T | null> {
      return withConstraint("nullable")
    },
    default<V>(value: V): Column<T> {
      return withConstraint("default", [value])
    },
    unique(): Column<T> {
      return withConstraint("unique")
    },
    index(): Column<T> {
      return withConstraint("index")
    },
    min(n: number): Column<T> {
      return withConstraint("min", [n])
    },
    max(n: number): Column<T> {
      return withConstraint("max", [n])
    },
    email(): Column<T> {
      return withConstraint("email")
    },
    url(): Column<T> {
      return withConstraint("url")
    },
    pattern(regex: RegExp | string): Column<T> {
      const source = typeof regex === "string" ? regex : regex.source
      return withConstraint("pattern", [source])
    },
    references(table: () => unknown, refColumns: string[]): Column<T> {
      return withConstraint("references", [table, refColumns])
    },
  }

  return col
}

export type ColumnShape = Record<string, Column>
export type ColumnValue<C> = C extends Column<infer T> ? T : never

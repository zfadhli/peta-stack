export interface Constraint {
  type: string
  args: unknown[]
}

export interface SchemaConfig {
  compile(dataType: string, args: unknown[], constraints: Constraint[]): unknown
  parse<T>(schema: unknown, value: unknown): T
  assert<T>(schema: unknown, value: unknown): T
}

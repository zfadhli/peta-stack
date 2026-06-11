import "hono"

declare module "hono" {
  interface ContextVariableMap {
    session: {
      userId?: number
      userRole?: string
      save(): Promise<void>
      destroy(): void
      [key: string]: unknown
    }
  }
}

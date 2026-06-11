import "hono"

declare module "hono" {
  interface ContextVariableMap {
    currentUserId?: number
    currentUsername?: string
  }
}

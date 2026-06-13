import "hono"

declare module "hono" {
  interface ContextVariableMap {
    currentUserId?: string
    currentUsername?: string
  }
}

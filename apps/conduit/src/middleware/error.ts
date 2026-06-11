import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"

/**
 * Global error handler that returns RealWorld-compliant error responses:
 * `{ errors: { field: ["message"] } }`
 */
export function onError(err: Error, c: Context): Response {
  // HTTPException — use its status and message
  if (err instanceof HTTPException) {
    const status = err.status
    const message = err.message

    // Map status codes to error field names per RealWorld spec
    if (status === 422) {
      return c.json({ errors: { body: [message] } }, 422)
    }
    if (status === 401) {
      return c.json({ errors: { token: [message] } }, 401)
    }
    if (status === 403) {
      return c.json({ errors: { resource: ["forbidden"] } }, 403)
    }
    if (status === 404) {
      return c.json({ errors: { resource: ["not found"] } }, 404)
    }
    if (status === 409) {
      return c.json({ errors: { resource: ["already taken"] } }, 409)
    }
    return c.json({ errors: { body: [message] } }, status)
  }

  // Unknown errors — 500
  console.error(err)
  return c.json({ errors: { body: ["Internal server error"] } }, 500)
}

/** Validation error handler for the RouteBuilder */
export function onValidationError(issues: unknown[], c: Context): Response {
  const errors: Record<string, string[]> = {}
  for (const issue of issues as Array<{ path?: (string | number)[]; message?: string }>) {
    const key = issue.path?.length ? String(issue.path[0]) : "body"
    if (!errors[key]) errors[key] = []
    errors[key].push(issue.message ?? "is invalid")
  }
  return c.json({ errors }, 422)
}

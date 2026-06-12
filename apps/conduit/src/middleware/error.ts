import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"

/**
 * Global error handler that returns RealWorld-compliant error responses:
 * `{ errors: { field: ["message"] } }`
 */
/**
 * Parse a field name from an error message formatted as "field: message".
 * Falls back to "body" if no colon separator is found.
 */
function parseField(message: string, defaultField = "body"): { field: string; msg: string } {
  const idx = message.indexOf(": ")
  if (idx > 0) {
    return { field: message.slice(0, idx), msg: message.slice(idx + 2) }
  }
  return { field: defaultField, msg: message }
}

export function onError(err: Error, c: Context): Response {
  // HTTPException — use its status and message
  if (err instanceof HTTPException) {
    const status = err.status
    const message = err.message

    if (status === 401) {
      // Parse field name from message (e.g. "token: is missing" or "credentials: invalid")
      const { field, msg } = parseField(message, "token")
      return c.json({ errors: { [field]: [msg] } }, 401)
    }
    if (status === 403) {
      // Parse field name from message (e.g. "article: forbidden")
      const { field, msg } = parseField(message, "resource")
      return c.json({ errors: { [field]: [msg] } }, 403)
    }
    if (status === 404) {
      // Parse field name from message (e.g. "article: not found")
      const { field, msg } = parseField(message, "resource")
      return c.json({ errors: { [field]: [msg] } }, 404)
    }
    if (status === 409) {
      const { field, msg } = parseField(message, "resource")
      return c.json({ errors: { [field]: [msg] } }, 409)
    }
    if (status === 422) {
      return c.json({ errors: { body: [message] } }, 422)
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
  for (const issue of issues as Array<{
    path?: (string | number)[]
    message?: string
    actual?: unknown
  }>) {
    // Use the LAST path segment as the field name (e.g. "user.username" → "username")
    // This matches RealWorld spec expectations for nested request bodies
    const key = issue.path?.length ? String(issue.path[issue.path.length - 1]) : "body"
    if (!errors[key]) errors[key] = []

    // ArkType messages include the full path prefix (e.g. "user.username must be non-empty")
    // Strip it to get just the validation message
    let msg = issue.message ?? "is invalid"
    if (issue.path?.length) {
      const prefix = issue.path.join(".") + " "
      if (msg.startsWith(prefix)) msg = msg.slice(prefix.length)
    }

    // Check if the actual value was empty (blank string)
    // ArkType stringifies string values: actual is "" for empty strings,
    // or '""' for email fields (pattern validation wraps it in quotes)
    const rawActual = String(issue.actual ?? "")
    const isEmpty = rawActual === "" || rawActual === '""' || rawActual === "undefined"

    // Normalize common ArkType messages to RealWorld spec messages
    if (isEmpty || msg === "must be non-empty" || msg === "must not be empty") {
      msg = "can't be blank"
    } else if (msg.includes("must be at least")) {
      msg = "is too short"
    } else if (msg.includes("must be an email address") || msg.includes("must be a valid email")) {
      msg = "is invalid"
    }
    errors[key].push(msg)
  }
  return c.json({ errors }, 422)
}

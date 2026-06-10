import type { IronSession } from "./session.ts"

export interface CSRFOptions {
  key?: string
}

export async function generateCsrf(session: IronSession, options?: CSRFOptions): Promise<string> {
  const key = options?.key ?? "_csrfToken"
  const token = crypto.randomUUID()
  ;(session as Record<string, unknown>)[key] = token
  return token
}

export function validateCsrf(session: IronSession, token: string, options?: CSRFOptions): boolean {
  const key = options?.key ?? "_csrfToken"
  const stored = (session as Record<string, unknown>)[key]
  return typeof stored === "string" && stored === token
}

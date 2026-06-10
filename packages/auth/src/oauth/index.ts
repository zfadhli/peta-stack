import { parse, serialize } from "cookie"

const isDevelopment = process.env.NODE_ENV === "development"
const OAUTH_COOKIE_MAX_AGE = 60 * 10

function encodeBase64Url(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function getRandomBytes(size = 32): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size))
}

function oauthCookieOptions(maxAge: number) {
  return {
    path: "/" as const,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: !isDevelopment,
    maxAge,
  }
}

export function getOAuthRedirectURL(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}${url.pathname}`
}

export async function handlePKCE(request: Request): Promise<{
  codeChallenge?: string
  codeChallengeMethod?: string
  codeVerifier?: string
  setCookie?: string
}> {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const cookieStr = request.headers.get("cookie") ?? ""
  const cookies = parse(cookieStr)

  if (code) {
    const verifier = cookies["peta-auth-pkce"]
    return { codeVerifier: verifier }
  }

  const verifierBytes = getRandomBytes(32)
  const verifier = encodeBase64Url(verifierBytes)
  const encoder = new TextEncoder()
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)))
  const codeChallenge = encodeBase64Url(hash)

  return {
    codeChallenge,
    codeChallengeMethod: "S256",
    setCookie: serialize("peta-auth-pkce", verifier, oauthCookieOptions(OAUTH_COOKIE_MAX_AGE)),
  }
}

export function handleState(request: Request): {
  state?: string
  expectedState?: string
  setCookie?: string
} {
  const url = new URL(request.url)
  const queryState = url.searchParams.get("state")
  const cookieStr = request.headers.get("cookie") ?? ""
  const cookies = parse(cookieStr)

  if (queryState) {
    return {
      state: queryState,
      expectedState: cookies["peta-auth-state"],
    }
  }

  const stateBytes = getRandomBytes(8)
  const state = encodeBase64Url(stateBytes)

  return {
    state,
    setCookie: serialize("peta-auth-state", state, oauthCookieOptions(OAUTH_COOKIE_MAX_AGE)),
  }
}

export interface RequestAccessTokenOptions {
  body?: Record<string, string | undefined>
  params?: Record<string, string | undefined>
  headers?: Record<string, string>
}

export async function requestAccessToken<T = unknown>(url: string, options: RequestAccessTokenOptions): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    ...options.headers,
  }

  const bodyParams = options.body ?? options.params ?? {}
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(bodyParams)) {
    if (value !== undefined) body.append(key, value)
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: body.toString(),
  })

  if (!response.ok) {
    if (response.status === 401) {
      return response.json() as Promise<T>
    }
    throw new Error(`OAuth token request failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export function redirect(url: string, cookie?: string): Response {
  const headers = new Headers({ Location: url })
  if (cookie) headers.append("Set-Cookie", cookie)
  return new Response(null, { status: 302, headers })
}

export function handleMissingConfiguration(
  provider: string,
  missingKeys: string[],
  onError?: (err: Error) => Response | Promise<Response>,
): Response | Promise<Response> {
  const envVars = missingKeys.map(
    (k) => `PETA_OAUTH_${provider.toUpperCase()}_${k.replace(/([A-Z])/g, "_$1").toUpperCase()}`,
  )
  const err = new Error(`Missing ${envVars.join(" or ")} env ${missingKeys.length > 1 ? "variables" : "variable"}.`)
  if (onError) return onError(err)
  return new Response(JSON.stringify({ error: err.message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  })
}

export function handleAccessTokenError(
  provider: string,
  errorData: Record<string, string>,
  onError?: (err: Error) => Response | Promise<Response>,
): Response | Promise<Response> {
  const message = `${provider} login failed: ${errorData.error_description || errorData.error || "Unknown error"}`
  const err = new Error(message)
  if (onError) return onError(err)
  return new Response(JSON.stringify({ error: err.message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })
}

export function handleInvalidState(
  provider: string,
  onError?: (err: Error) => Response | Promise<Response>,
): Response | Promise<Response> {
  const err = new Error(`${provider} login failed: state mismatch`)
  if (onError) return onError(err)
  return new Response(JSON.stringify({ error: err.message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  })
}

import { parse, serialize } from "cookie"
import { constantTimeEqual } from "../csrf.js"
import { PetaAuthError } from "../errors.js"

const IS_DEVELOPMENT = process.env.NODE_ENV === "development"
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
    secure: !IS_DEVELOPMENT,
    maxAge,
  }
}

/**
 * Extract the OAuth redirect URL from a request.
 */
export function getOAuthRedirectURL(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}${url.pathname}`
}

/**
 * Handle PKCE (Proof Key for Code Exchange) for OAuth flows.
 *
 * On the initial redirect leg it generates a code verifier + challenge.
 * On the callback leg it extracts the stored verifier from the cookie.
 */
export async function handlePKCE(request: Request): Promise<{
  codeChallenge?: string
  codeChallengeMethod?: string
  codeVerifier?: string
  setCookie?: string
}> {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const cookieString = request.headers.get("cookie") ?? ""
  const cookies = parse(cookieString)

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

/**
 * Handle OAuth state parameter for CSRF protection.
 */
export function handleState(request: Request): {
  state?: string
  expectedState?: string
  setCookie?: string
} {
  const url = new URL(request.url)
  const queryState = url.searchParams.get("state")
  const cookieString = request.headers.get("cookie") ?? ""
  const cookies = parse(cookieString)

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

/** Options for {@link requestAccessToken}. */
export interface RequestAccessTokenOptions {
  body?: Record<string, string | undefined>
  params?: Record<string, string | undefined>
  headers?: Record<string, string>
}

/**
 * Exchange an authorization code for an access token.
 */
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
    throw new PetaAuthError(
      "OAUTH_TOKEN_FAILED",
      `OAuth token request failed: ${response.status} ${response.statusText}`,
    )
  }

  return response.json() as Promise<T>
}

/**
 * Create a 302 redirect response, optionally with a cookie.
 */
export function redirect(url: string, cookie?: string): Response {
  const headers = new Headers({ Location: url })
  if (cookie) headers.append("Set-Cookie", cookie)
  return new Response(null, { status: 302, headers })
}

/**
 * Create a JSON error response with the given status code.
 */
export function jsonError(error: Error, status: number): Response {
  return new Response(JSON.stringify({ error: error.message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Handle missing OAuth configuration.
 */
export function handleMissingConfiguration(
  provider: string,
  missingKeys: string[],
  onError?: (err: Error) => Response | Promise<Response>,
): Response | Promise<Response> {
  const envVars = missingKeys.map(
    (key) => `PETA_OAUTH_${provider.toUpperCase()}_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`,
  )
  const error = new Error(`Missing ${envVars.join(" or ")} env ${missingKeys.length > 1 ? "variables" : "variable"}.`)
  if (onError) return onError(error)
  return jsonError(error, 500)
}

/**
 * Handle OAuth access token errors.
 */
export function handleAccessTokenError(
  provider: string,
  errorData: Record<string, string>,
  onError?: (err: Error) => Response | Promise<Response>,
): Response | Promise<Response> {
  const message = `${provider} login failed: ${errorData.error_description || errorData.error || "Unknown error"}`
  const error = new Error(message)
  if (onError) return onError(error)
  return jsonError(error, 401)
}

/** Resolved config shape shared across OAuth providers. */
export interface OAuthResolvedConfig {
  clientId: string
  clientSecret: string
  redirectURL?: string
  authorizationURL: string
  tokenURL: string
  scope: string[]
  authorizationParams: Record<string, string>
  // Provider-specific extras
  apiURL?: string
  userInfoURL?: string
  emailRequired?: boolean
}

/**
 * Configuration for a specific OAuth provider (GitHub, Google, etc.).
 * Provides the variation points that differ between providers.
 */
export interface OAuthProviderConfig<TTokens, TUser> {
  /** Provider name for error messages (e.g. "github", "google"). */
  name: string
  /** Resolve user-provided config with defaults and env vars. */
  resolveConfig: (config: object) => OAuthResolvedConfig
  /** Build the authorization URL for the initial redirect. */
  buildAuthUrl: (
    config: OAuthResolvedConfig,
    redirectURL: string,
    state: { state?: string; setCookie?: string },
    pkce: Awaited<ReturnType<typeof handlePKCE>>,
  ) => { url: string; cookies?: string }
  /** Build the token request body for the access token exchange. */
  requestTokenBody: (
    config: OAuthResolvedConfig,
    redirectURL: string,
    code: string,
    pkce: Awaited<ReturnType<typeof handlePKCE>>,
  ) => Record<string, string>
  /** Fetch user info with the access token. Returns the user data. */
  fetchUser: (
    config: OAuthResolvedConfig,
    tokens: TTokens,
    request: Request,
  ) => Promise<TUser>
}

/**
 * Define an OAuth event handler using a provider-specific config.
 *
 * Handles the shared OAuth flow (redirect, callback, token exchange, user fetch)
 * while delegating provider-specific behavior to the config callbacks.
 */
export function defineOAuthHandler<TTokens, TUser>(
  provider: OAuthProviderConfig<TTokens, TUser>,
  options: {
    config?: object
    onSuccess: (data: { user: TUser; tokens: TTokens; request: Request }) => Response | Promise<Response>
    onError?: (error: Error) => Response | Promise<Response>
  },
): (request: Request) => Promise<Response> {
  const { config: userConfig = {}, onSuccess, onError } = options

  return async (request: Request): Promise<Response> => {
    const config = provider.resolveConfig(userConfig)

    const url = new URL(request.url)
    const queryCode = url.searchParams.get("code")
    const queryError = url.searchParams.get("error")
    const queryState = url.searchParams.get("state")

    if (queryError) {
      const error = new Error(`${provider.name} login failed: ${queryError}`)
      if (onError) return onError(error)
      return jsonError(error, 401)
    }

    if (!config.clientId || !config.clientSecret) {
      const missing: string[] = []
      if (!config.clientId) missing.push("clientId")
      if (!config.clientSecret) missing.push("clientSecret")
      return handleMissingConfiguration(provider.name, missing, onError)
    }

    const redirectURL = config.redirectURL || getOAuthRedirectURL(request)
    const state = handleState(request)
    const pkce = await handlePKCE(request)

    if (!queryCode) {
      const { url: authUrl, cookies } = provider.buildAuthUrl(config, redirectURL, state, pkce)
      return redirect(authUrl, cookies)
    }

    if (!queryState || !state.expectedState || !constantTimeEqual(queryState, state.expectedState)) {
      return handleInvalidState(provider.name, onError)
    }

    const tokens = await requestAccessToken<TTokens>(config.tokenURL, {
      body: provider.requestTokenBody(config, redirectURL, queryCode, pkce),
    })

    if ((tokens as unknown as Record<string, string | undefined>).error) {
      return handleAccessTokenError(provider.name, tokens as unknown as Record<string, string>, onError)
    }

    const user = await provider.fetchUser(config, tokens, request)

    return onSuccess({ user, tokens, request })
  }
}

/**
 * Handle OAuth state mismatch.
 */
export function handleInvalidState(
  provider: string,
  onError?: (err: Error) => Response | Promise<Response>,
): Response | Promise<Response> {
  const error = new Error(`${provider} login failed: state mismatch`)
  if (onError) return onError(error)
  return jsonError(error, 500)
}

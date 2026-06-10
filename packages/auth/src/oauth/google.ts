import {
  getOAuthRedirectURL,
  handleAccessTokenError,
  handleInvalidState,
  handleMissingConfiguration,
  handlePKCE,
  handleState,
  redirect,
  requestAccessToken,
} from "./index.ts"

export interface OAuthGoogleConfig {
  clientId?: string
  clientSecret?: string
  scope?: string[]
  authorizationURL?: string
  tokenURL?: string
  userInfoURL?: string
  authorizationParams?: Record<string, string>
  redirectURL?: string
}

interface ResolvedOAuthGoogleConfig {
  clientId: string
  clientSecret: string
  scope: string[]
  authorizationURL: string
  tokenURL: string
  userInfoURL: string
  authorizationParams: Record<string, string>
  redirectURL?: string
}

function resolveGoogleConfig(config: OAuthGoogleConfig): ResolvedOAuthGoogleConfig {
  return {
    authorizationURL: config.authorizationURL ?? "https://accounts.google.com/o/oauth2/v2/auth",
    tokenURL: config.tokenURL ?? "https://oauth2.googleapis.com/token",
    userInfoURL: config.userInfoURL ?? "https://www.googleapis.com/oauth2/v3/userinfo",
    clientId: config.clientId ?? process.env.PETA_OAUTH_GOOGLE_CLIENT_ID ?? "",
    clientSecret: config.clientSecret ?? process.env.PETA_OAUTH_GOOGLE_CLIENT_SECRET ?? "",
    scope: config.scope ?? ["openid", "email", "profile"],
    authorizationParams: config.authorizationParams ?? {},
    redirectURL: config.redirectURL,
  }
}

interface GoogleUser {
  sub: string
  name: string
  given_name: string
  family_name: string
  picture: string
  email: string
  email_verified: boolean
  locale: string
}

interface GoogleTokens {
  access_token: string
  id_token: string
  scope: string
  token_type: string
  expires_in: number
}

export function defineOAuthGoogleEventHandler(options: {
  config?: OAuthGoogleConfig
  onSuccess: (event: { user: GoogleUser; tokens: GoogleTokens; request: Request }) => Response | Promise<Response>
  onError?: (error: Error) => Response | Promise<Response>
}): (request: Request) => Promise<Response> {
  const { config: userConfig = {}, onSuccess, onError } = options

  return async (request: Request): Promise<Response> => {
    const config = resolveGoogleConfig(userConfig)

    const url = new URL(request.url)
    const queryCode = url.searchParams.get("code")
    const queryError = url.searchParams.get("error")
    const queryState = url.searchParams.get("state")

    if (queryError) {
      const err = new Error(`Google login failed: ${queryError}`)
      if (onError) return onError(err)
      return new Response(JSON.stringify({ error: err.message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!config.clientId || !config.clientSecret) {
      const missing = []
      if (!config.clientId) missing.push("clientId")
      if (!config.clientSecret) missing.push("clientSecret")
      return handleMissingConfiguration("google", missing, onError)
    }

    const redirectURL = config.redirectURL || getOAuthRedirectURL(request)
    const state = handleState(request)
    const pkce = await handlePKCE(request)

    if (!queryCode) {
      const authUrl = new URL(config.authorizationURL)
      authUrl.searchParams.set("client_id", config.clientId)
      authUrl.searchParams.set("redirect_uri", redirectURL)
      authUrl.searchParams.set("scope", config.scope.join(" "))
      authUrl.searchParams.set("response_type", "code")
      authUrl.searchParams.set("state", state.state ?? "")

      if (pkce.codeChallenge) {
        authUrl.searchParams.set("code_challenge", pkce.codeChallenge)
        authUrl.searchParams.set("code_challenge_method", pkce.codeChallengeMethod ?? "S256")
      }

      for (const [k, v] of Object.entries(config.authorizationParams)) {
        authUrl.searchParams.set(k, v)
      }

      const cookies = [state.setCookie, pkce.setCookie].filter(Boolean).join("; ")
      return redirect(authUrl.toString(), cookies || undefined)
    }

    if (!queryState || queryState !== state.expectedState) {
      return handleInvalidState("google", onError)
    }

    const tokens = await requestAccessToken<GoogleTokens & { error?: string }>(config.tokenURL, {
      body: {
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectURL,
        code: queryCode,
        code_verifier: pkce.codeVerifier,
      },
    })

    const tokensRecord = tokens as unknown as Record<string, string | undefined>
    if (tokensRecord.error) {
      return handleAccessTokenError("google", tokensRecord as Record<string, string>, onError)
    }

    const userResponse = await fetch(config.userInfoURL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userResponse.ok) {
      const err = new Error(`Google user fetch failed: ${userResponse.status}`)
      if (onError) return onError(err)
      throw err
    }

    const user: GoogleUser = await userResponse.json()

    return onSuccess({ user, tokens, request })
  }
}

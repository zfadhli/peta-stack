import { defineOAuthHandler, type OAuthProviderConfig } from "./utils.js"

/** Configuration for Google OAuth. */
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

interface GoogleTokens {
  access_token: string
  id_token: string
  scope: string
  token_type: string
  expires_in: number
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

const googleProvider: OAuthProviderConfig<GoogleTokens, GoogleUser> = {
  name: "google",

  resolveConfig(config) {
    const c = config as OAuthGoogleConfig
    return {
      authorizationURL: c.authorizationURL ?? "https://accounts.google.com/o/oauth2/v2/auth",
      tokenURL: c.tokenURL ?? "https://oauth2.googleapis.com/token",
      userInfoURL: c.userInfoURL ?? "https://www.googleapis.com/oauth2/v3/userinfo",
      clientId: c.clientId ?? process.env.PETA_OAUTH_GOOGLE_CLIENT_ID ?? "",
      clientSecret: c.clientSecret ?? process.env.PETA_OAUTH_GOOGLE_CLIENT_SECRET ?? "",
      scope: c.scope ?? ["openid", "email", "profile"],
      authorizationParams: c.authorizationParams ?? {},
      redirectURL: c.redirectURL,
    }
  },

  buildAuthUrl(config, redirectURL, state, pkce) {
    const c = config as ReturnType<typeof googleProvider.resolveConfig>

    const authUrl = new URL(c.authorizationURL)
    authUrl.searchParams.set("client_id", c.clientId)
    authUrl.searchParams.set("redirect_uri", redirectURL)
    authUrl.searchParams.set("scope", c.scope.join(" "))
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("state", state.state ?? "")

    if (pkce.codeChallenge) {
      authUrl.searchParams.set("code_challenge", pkce.codeChallenge)
      authUrl.searchParams.set("code_challenge_method", pkce.codeChallengeMethod ?? "S256")
    }

    for (const [key, value] of Object.entries(c.authorizationParams)) {
      authUrl.searchParams.set(key, value)
    }

    const cookies = [state.setCookie, pkce.setCookie].filter(Boolean).join("; ")
    return { url: authUrl.toString(), cookies: cookies || undefined }
  },

  requestTokenBody(config, redirectURL, code, pkce) {
    return {
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectURL,
      code,
      code_verifier: pkce.codeVerifier ?? "",
    }
  },

  async fetchUser(config, tokens, _request) {
    const userURL = config.userInfoURL ?? "https://www.googleapis.com/oauth2/v3/userinfo"
    const userResponse = await fetch(userURL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userResponse.ok) {
      throw new Error(`Google user fetch failed: ${userResponse.status}`)
    }

    return userResponse.json() as Promise<GoogleUser>
  },
}

/**
 * Define a Google OAuth event handler.
 *
 * @example
 * ```ts
 * const handle = defineOAuthGoogleEventHandler({
 *   onSuccess: async ({ user }) =>
 *     new Response(`Welcome ${user.name}!`),
 * })
 * serve(handle)
 * ```
 */
export function defineOAuthGoogleEventHandler(options: {
  config?: OAuthGoogleConfig
  onSuccess: (event: { user: GoogleUser; tokens: GoogleTokens; request: Request }) => Response | Promise<Response>
  onError?: (error: Error) => Response | Promise<Response>
}): (request: Request) => Promise<Response> {
  return defineOAuthHandler<GoogleTokens, GoogleUser>(googleProvider, options)
}

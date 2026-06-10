import {
  getOAuthRedirectURL,
  handleAccessTokenError,
  handleInvalidState,
  handleMissingConfiguration,
  handleState,
  redirect,
  requestAccessToken,
} from "./index.js"

/** Configuration for GitHub OAuth. */
export interface OAuthGitHubConfig {
  clientId?: string
  clientSecret?: string
  scope?: string[]
  emailRequired?: boolean
  authorizationURL?: string
  tokenURL?: string
  apiURL?: string
  authorizationParams?: Record<string, string>
  redirectURL?: string
}

interface GitHubTokens {
  access_token: string
  scope: string
  token_type: string
}

interface GitHubUser {
  login: string
  id: number
  node_id: string
  avatar_url: string
  name: string
  email: string | null
  email_verified?: boolean
}

function resolveConfig(config: OAuthGitHubConfig) {
  return {
    authorizationURL: config.authorizationURL ?? "https://github.com/login/oauth/authorize",
    tokenURL: config.tokenURL ?? "https://github.com/login/oauth/access_token",
    apiURL: config.apiURL ?? "https://api.github.com",
    clientId: config.clientId ?? process.env.PETA_OAUTH_GITHUB_CLIENT_ID ?? "",
    clientSecret: config.clientSecret ?? process.env.PETA_OAUTH_GITHUB_CLIENT_SECRET ?? "",
    scope: config.scope ?? [],
    emailRequired: config.emailRequired ?? false,
    authorizationParams: config.authorizationParams ?? {},
    redirectURL: config.redirectURL,
  }
}

/**
 * Define a GitHub OAuth event handler.
 *
 * @example
 * ```ts
 * const handle = defineOAuthGitHubEventHandler({
 *   onSuccess: async ({ user, tokens }) =>
 *     new Response(`Welcome ${user.login}!`),
 * })
 * serve(handle)
 * ```
 */
export function defineOAuthGitHubEventHandler(options: {
  config?: OAuthGitHubConfig
  onSuccess: (event: { user: GitHubUser; tokens: GitHubTokens; request: Request }) => Response | Promise<Response>
  onError?: (error: Error) => Response | Promise<Response>
}): (request: Request) => Promise<Response> {
  const { config: userConfig = {}, onSuccess, onError } = options

  return async (request: Request): Promise<Response> => {
    const config = resolveConfig(userConfig)

    const url = new URL(request.url)
    const queryCode = url.searchParams.get("code")
    const queryError = url.searchParams.get("error")
    const queryState = url.searchParams.get("state")

    if (queryError) {
      const error = new Error(`GitHub login failed: ${queryError}`)
      if (onError) return onError(error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!config.clientId || !config.clientSecret) {
      const missing: string[] = []
      if (!config.clientId) missing.push("clientId")
      if (!config.clientSecret) missing.push("clientSecret")
      return handleMissingConfiguration("github", missing, onError)
    }

    const redirectURL = config.redirectURL || getOAuthRedirectURL(request)
    const state = handleState(request)

    if (!queryCode) {
      if (config.emailRequired && !config.scope.includes("user:email")) {
        config.scope.push("user:email")
      }

      const authUrl = new URL(config.authorizationURL)
      authUrl.searchParams.set("client_id", config.clientId)
      authUrl.searchParams.set("redirect_uri", redirectURL)
      authUrl.searchParams.set("scope", config.scope.join(" "))
      authUrl.searchParams.set("state", state.state ?? "")

      for (const [key, value] of Object.entries(config.authorizationParams)) {
        authUrl.searchParams.set(key, value)
      }

      return redirect(authUrl.toString(), state.setCookie)
    }

    if (!queryState || queryState !== state.expectedState) {
      return handleInvalidState("github", onError)
    }

    const tokens = await requestAccessToken<GitHubTokens>(config.tokenURL, {
      body: {
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectURL,
        code: queryCode,
      },
    })

    if ((tokens as unknown as Record<string, string | undefined>).error) {
      return handleAccessTokenError("github", tokens as unknown as Record<string, string>, onError)
    }

    const accessToken = tokens.access_token
    const userResponse = await fetch(`${config.apiURL}/user`, {
      headers: {
        "User-Agent": `GitHub-OAuth-${config.clientId}`,
        Authorization: `token ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      const error = new Error(`GitHub user fetch failed: ${userResponse.status}`)
      if (onError) return onError(error)
      throw error
    }

    const user: GitHubUser = await userResponse.json()

    if (!user.email && config.emailRequired) {
      const emailsResponse = await fetch(`${config.apiURL}/user/emails`, {
        headers: {
          "User-Agent": `GitHub-OAuth-${config.clientId}`,
          Authorization: `token ${accessToken}`,
        },
      })

      if (emailsResponse.ok) {
        const emails: Array<{
          email: string
          primary: boolean
          verified: boolean
        }> = await emailsResponse.json()
        const primaryEmail = emails.find((entry) => entry.primary)
        if (primaryEmail) {
          user.email = primaryEmail.email
          user.email_verified = primaryEmail.verified
        }
      }
    }

    return onSuccess({ user, tokens, request })
  }
}

import { defineOAuthHandler, type OAuthProviderConfig } from "./utils.js"

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

const githubProvider: OAuthProviderConfig<GitHubTokens, GitHubUser> = {
  name: "github",

  resolveConfig(config) {
    const c = config as OAuthGitHubConfig
    return {
      authorizationURL: c.authorizationURL ?? "https://github.com/login/oauth/authorize",
      tokenURL: c.tokenURL ?? "https://github.com/login/oauth/access_token",
      apiURL: c.apiURL ?? "https://api.github.com",
      clientId: c.clientId ?? process.env.PETA_OAUTH_GITHUB_CLIENT_ID ?? "",
      clientSecret: c.clientSecret ?? process.env.PETA_OAUTH_GITHUB_CLIENT_SECRET ?? "",
      scope: c.scope ?? [],
      emailRequired: c.emailRequired ?? false,
      authorizationParams: c.authorizationParams ?? {},
      redirectURL: c.redirectURL,
    }
  },

  buildAuthUrl(config, redirectURL, state, _pkce) {
    const c = config as ReturnType<typeof githubProvider.resolveConfig>

    let scope = c.scope
    if (c.emailRequired && !scope.includes("user:email")) {
      scope = [...c.scope, "user:email"]
    }

    const authUrl = new URL(c.authorizationURL)
    authUrl.searchParams.set("client_id", c.clientId)
    authUrl.searchParams.set("redirect_uri", redirectURL)
    authUrl.searchParams.set("scope", scope.join(" "))
    authUrl.searchParams.set("state", state.state ?? "")

    for (const [key, value] of Object.entries(c.authorizationParams)) {
      authUrl.searchParams.set(key, value)
    }

    return { url: authUrl.toString(), cookies: state.setCookie }
  },

  requestTokenBody(config, redirectURL, code, _pkce) {
    return {
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectURL,
      code,
    }
  },

  async fetchUser(config, tokens, _request) {
    const c = config as ReturnType<typeof githubProvider.resolveConfig>
    const accessToken = tokens.access_token

    const userResponse = await fetch(`${c.apiURL}/user`, {
      headers: {
        "User-Agent": `GitHub-OAuth-${c.clientId}`,
        Authorization: `token ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error(`GitHub user fetch failed: ${userResponse.status}`)
    }

    const user: GitHubUser = await userResponse.json()

    if (!user.email && c.emailRequired) {
      const emailsResponse = await fetch(`${c.apiURL}/user/emails`, {
        headers: {
          "User-Agent": `GitHub-OAuth-${c.clientId}`,
          Authorization: `token ${accessToken}`,
        },
      })

      if (emailsResponse.ok) {
        const emails: Array<{ email: string; primary: boolean; verified: boolean }> =
          await emailsResponse.json()
        const primaryEmail = emails.find((entry) => entry.primary)
        if (primaryEmail) {
          user.email = primaryEmail.email
          user.email_verified = primaryEmail.verified
        }
      }
    }

    return user
  },
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
  onSuccess: (event: {
    user: GitHubUser
    tokens: GitHubTokens
    request: Request
  }) => Response | Promise<Response>
  onError?: (error: Error) => Response | Promise<Response>
}): (request: Request) => Promise<Response> {
  return defineOAuthHandler<GitHubTokens, GitHubUser>(githubProvider, options)
}

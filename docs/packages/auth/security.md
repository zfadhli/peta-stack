# Security & Operations

This guide covers production-hardening considerations when using `peta-auth`.

## Session Cookie Configuration

### Recommended Production Settings

```ts
app.use("*", session({
  password: process.env.SESSION_SECRET!,
  cookieName: "session",
  cookieOptions: {
    httpOnly: true,       // Prevents JavaScript access (XSS mitigation)
    secure: true,         // Only send over HTTPS
    sameSite: "lax",      // CSRF protection (default: "lax")
    path: "/",            // Cookie scope
    domain: ".example.com", // Set for subdomain sharing if needed
  },
  ttl: 60 * 60 * 24 * 7,  // 7 days — shorter is better for sensitive apps
}))
```

### Cookie Flags Reference

| Flag | Recommended | Purpose |
|------|------------|---------|
| `httpOnly` | `true` | Prevents JavaScript access via `document.cookie` |
| `secure` | `true` | Only sends cookie over HTTPS |
| `sameSite` | `"lax"` or `"strict"` | CSRF protection. `"strict"` is more secure but may break some OAuth flows |
| `path` | `"/"` | Cookie scope. Narrow it if only specific paths need sessions |

## Password Secret Rotation

The `password` option supports object syntax for rotation:

```ts
session({
  password: {
    1: process.env.OLD_SESSION_SECRET!,     // old — still decrypts existing cookies
    2: process.env.SESSION_SECRET!,          // new — used for encrypting new cookies
  },
  cookieName: "session",
})
```

When rotating, the highest numeric key is used for encryption. All keys are tried for decryption.

## Rate Limiting

peta-auth does not include rate limiting. Add it to your app to protect auth endpoints:

```ts
import { rateLimiter } from "hono-rate-limiter"

app.use("/login", rateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                     // limit each IP to 10 requests per window
  message: { error: "Too many requests" },
}))
```

## OAuth Security

### State Parameter

Both GitHub and Google OAuth handlers use the `state` parameter for CSRF protection. The state is stored in a cookie and validated on callback.

### PKCE (Google)

Google OAuth uses PKCE (Proof Key for Code Exchange) for additional security. The code verifier is stored in a cookie and validated during token exchange.

### Redirect URI Validation

Always validate redirect URIs on the server side. Both handlers accept a `redirectUri` in configuration:

```ts
defineOAuthGitHubEventHandler({
  config: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    redirectUri: "https://example.com/auth/github/callback",
  },
  onSuccess: async ({ user, tokens }) => { /* ... */ },
})
```

## JWT Security

### Token Expiry

Set a reasonable expiry for JWTs. 14 days is common for refresh tokens; access tokens should be shorter:

```ts
// Short-lived access token
const token = await signJWT({ userId: 42 }, { password: secret, exp: 900 })  // 15 min

// Long-lived refresh token
const refresh = await signJWT({ userId: 42, type: "refresh" }, { password: refreshSecret, exp: 604800 })  // 7 days
```

### Secret Length

All secrets require a minimum of 32 characters. This ensures adequate key strength for AES-256.

## CSRF Protection

For form-based apps:

1. Generate token on page load with `generateCsrf(session)` and `await session.save()`
2. Include the token in a hidden form field: `<input name="_csrf" value="${token}" />`
3. Validate on submission with `validateCsrf(session, body._csrf)`

> [!TIP]
> API-based apps using `SameSite: "lax"` cookies typically don't need CSRF tokens.

## Environment Variables

Store secrets in environment variables, never in code:

```bash
# .env
SESSION_SECRET="your-32-char-minimum-secret-here"
JWT_SECRET="your-32-char-minimum-jwt-secret-here"
PETA_OAUTH_GITHUB_CLIENT_ID="..."
PETA_OAUTH_GITHUB_CLIENT_SECRET="..."
```

## Cookie Size Limits

`iron-webcrypto` enforces a 4096-byte cookie size limit. If you exceed this, `session.save()` throws. Strategies to stay under the limit:

- Store only identifiers (user IDs, roles) in the session, not full objects
- Use the session to store a session ID, and look up data from a database
- Compress data before storing (though this adds complexity)

## Security Headers

Add security headers to your Hono app:

```ts
app.use("*", async (c, next) => {
  await next()
  c.res.headers.set("X-Content-Type-Options", "nosniff")
  c.res.headers.set("X-Frame-Options", "DENY")
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  c.res.headers.set("Content-Security-Policy", "default-src 'self'")
})
```

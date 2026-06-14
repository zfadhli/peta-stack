# peta-auth

[![npm version](https://img.shields.io/npm/v/peta-auth?style=flat-square)](https://www.npmjs.com/package/peta-auth)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

Encrypted cookie sessions for Bun — with first-class adapters for **Hono**, **ElysiaJS**, and **Nuxt**.

Uses `iron-webcrypto` (AES-256-CBC + HMAC-SHA256) to seal session data into stateless, signed-and-encrypted cookies. No server-side storage needed.

Also provides JWT signing/verification, CSRF protection, password hashing (argon2), password reset flows, and OAuth (GitHub, Google).

```bash
bun add peta-auth
```

---

## Quick Start

### Hono

```ts
import { Hono } from "hono"
import { session, requireSession } from "peta-auth/hono"

const app = new Hono()

app.use("*", session({
  password: process.env.SESSION_SECRET!,  // at least 32 characters
  cookieName: "my-session",
}))

app.post("/login", async (c) => {
  c.var.session.user = await c.req.json()
  await c.var.session.save()
  return c.json({ ok: true })
})

// Everything after requireSession returns 401 if not logged in
app.use("/api/*", requireSession())
app.get("/api/profile", (c) => c.json(c.var.session.user))
```

### ElysiaJS

```ts
import { Elysia } from "elysia"
import { session, requireSession } from "peta-auth/elysia"

new Elysia()
  .use(session({ password: process.env.SESSION_SECRET!, cookieName: "my-session" }))
  .post("/login", async ({ session: s, body }: any) => {
    s.user = body
    await s.save()
    return { ok: true }
  })
  .use(requireSession())
  .get("/profile", ({ session: s }) => s.user)
  .listen(3000)
```

### Nuxt

```ts
// server/api/login.post.ts
import { useSession, requireSession } from "peta-auth/nuxt"

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: "nuxt-session",
  })
  requireSession(event, session)
  return session.user
})
```

---

## Session API

### `session(options)`

Reads the session from the incoming cookie and attaches it to the framework's context.

```ts
session({
  password: process.env.SESSION_SECRET!,     // required, >= 32 chars
  cookieName: "my-session",                  // required
  ttl: 60 * 60 * 24 * 14,                   // optional, default 14 days
  cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
})
```

#### Password rotation

```ts
session({ password: { 1: "old-pw", 2: "new-pw" }, cookieName: "my-session" })
// New cookies use key 2, old cookies still decrypt with key 1
```

### Typed sessions

```ts
// Hono
app.use("*", session<{ user: { name: string }; views: number }>({ password, cookieName }))
// c.var.session.user.name → string

// Elysia
app.use(session<{ user: { name: string } }>({ password, cookieName }))
```

### `requireSession()` guard

Returns 401 if the session has no data. Optionally checks a specific key:

```ts
app.use("/api/*", requireSession())         // any session data
app.use("/admin/*", requireSession("role")) // session.role must be truthy
```

### Session object

```ts
interface IronSession {
  save(): Promise<void>            // seal & write cookie
  destroy(): void                  // clear data & expire cookie
  updateConfig(opts): void         // change options for this request
  [key: string]: unknown           // your data
}
```

---

## JWT

Sign and verify HS256 JWTs using the same password infrastructure.

```ts
import { signJWT, verifyJWT } from "peta-auth/jwt"

const token = await signJWT({ userId: 42, role: "admin" }, {
  password: process.env.JWT_SECRET!,
  exp: 3600,                         // optional, seconds from now
})

const payload = await verifyJWT<{ userId: number; role: string }>(token, {
  password: process.env.JWT_SECRET!,
})
if (!payload) throw new Error("invalid or expired token")
```

- Supports password rotation (tries all keys on verify, signs with highest)
- Requires password at least 32 characters

---

## CSRF Protection

```ts
import { generateCsrf, validateCsrf } from "peta-auth/csrf"

// Generate token on form page
const token = await generateCsrf(session)
await session.save()

// Validate on form submission
if (!validateCsrf(session, body._csrf)) {
  throw new Error("CSRF mismatch")
}
```

---

## Password Reset

```ts
import { createPasswordResetToken, verifyPasswordResetToken, resetPassword } from "peta-auth"

// Generate a token (e.g., in a "forgot password" endpoint)
const token = await createPasswordResetToken(user.email, {
  password: process.env.SECRET!,
  exp: 3600,
})

// Verify token + hash new password
const result = await resetPassword(token, newPassword, process.env.SECRET!)
if (!result) throw new Error("Invalid or expired token")
```

---

## OAuth

Framework-agnostic handlers for GitHub and Google:

```ts
import { defineOAuthGitHubEventHandler } from "peta-auth/oauth/github"
import { defineOAuthGoogleEventHandler } from "peta-auth/oauth/google"

const githubHandler = defineOAuthGitHubEventHandler({
  config: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
  async onSuccess({ user, tokens }) {
    return new Response(null, { status: 302, headers: { Location: "/" } })
  },
})

app.get("/auth/github", async (c) => githubHandler(c.req.raw))
```

Requires env vars: `PETA_OAUTH_GITHUB_CLIENT_ID`, `PETA_OAUTH_GITHUB_CLIENT_SECRET` (or `PETA_OAUTH_GOOGLE_*`).

---

## Password Hashing

```ts
import { hashPassword, verifyPassword } from "peta-auth"

const hash = await hashPassword("my-password", { memoryCost: 19456 })
const match = await verifyPassword(hash, "my-password")
```

Uses argon2id via `@node-rs/argon2`.

---

## Low-level API

```ts
import { createSessionFromAdapter, sealData, unsealData } from "peta-auth"

// Create a session from any cookie adapter
const session = await createSessionFromAdapter({ getCookie, setCookie }, options)

// Encrypt/decrypt arbitrary data
const sealed = await sealData({ foo: "bar" }, { password })
const data = await unsealData(sealed, { password })
```

---

## Examples

```bash
bun run examples/hono-basic.ts           # Hono — session CRUD, views counter
bun run examples/hono-guard.ts           # Hono — requireSession guard
bun run examples/elysia-basic.ts         # Elysia — session CRUD
bun run examples/elysia-guard.ts         # Elysia — requireSession guard
bun run examples/password-auth.ts        # Hono — signup + login
bun run examples/password-reset.ts       # Hono — forgot/reset password flow
bun run examples/jwt-basic.ts            # JWT sign + verify
bun run examples/csrf-basic.ts           # CSRF token example
bun run examples/oauth-github.ts         # Hono — GitHub OAuth
bun run examples/oauth-google.ts         # Hono — Google OAuth (PKCE)
```

---

## How it works

Session data is serialized, encrypted with AES-256-CBC, integrity-protected with HMAC-SHA256, and stored in a single cookie. The session is **stateless** — no database, no Redis, no server-side storage.

- `session.save()` — seals the current data into the cookie
- `session.destroy()` — clears data and expires the cookie
- Multiple mutations can be made before `save()` — only one seal operation
- Cookie size limit of 4096 bytes applies (throws if exceeded)

---

## Related packages

- [peta-orm](../orm) — ORM with models, relations, hooks, soft deletes
- [peta-docs](../docs) — OpenAPI 3.1 spec generation + Scalar UI

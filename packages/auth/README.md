# peta-auth

Encrypted cookie sessions for Bun — with first-class adapters for **Hono**, **ElysiaJS**, and **Nuxt**.

Uses `iron-webcrypto` (AES-256-CBC + HMAC-SHA256) to seal session data into stateless, signed-and-encrypted cookies. No server-side storage needed.

Inspired by [iron-session](https://github.com/vvo/iron-session) and [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils).

```bash
bun add peta-auth
```

Install only the framework adapters you need:

```bash
bun add hono           # for peta-auth/hono
bun add elysia         # for peta-auth/elysia
# Nuxt already includes h3 — just add peta-auth
```

---

## Quick start

### Hono

```ts
import { Hono } from 'hono'
import { session, requireSession } from 'peta-auth/hono'

const app = new Hono()

app.use('*', session({
  password: process.env.SESSION_SECRET!,
  cookieName: 'my-session',
}))

app.post('/login', async (c) => {
  const { name } = await c.req.json()
  c.var.session.user = { name }
  await c.var.session.save()
  return c.json({ ok: true })
})

// Everything below requireSession returns 401 if not logged in
app.use('/api/*', requireSession())

app.get('/api/profile', (c) => c.json(c.var.session.user))

app.post('/logout', (c) => {
  c.var.session.destroy()
  return c.json({ ok: true })
})
```

Run with `bun run file.ts` — Bun auto-starts the server.

### ElysiaJS

```ts
import { Elysia } from 'elysia'
import { session, requireSession } from 'peta-auth/elysia'

new Elysia()
  .use(session({
    password: process.env.SESSION_SECRET!,
    cookieName: 'my-session',
  }))
  .post('/login', async ({ session: s, body }: any) => {
    s.user = { name: body.name }
    await s.save()
    return Response.json({ ok: true })
  })
  .get('/public', () => Response.json({ message: 'public' }))
  // Everything after requireSession is guarded
  .use(requireSession())
  .get('/profile', ({ session: s }) => Response.json(s.user))
  .listen(3000)
```

### Nuxt

```ts
// server/api/profile.get.ts
import { useSession, requireSession } from 'peta-auth/nuxt'

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: 'nuxt-session',
  })
  requireSession(event, session)
  return session.user
})
```

```ts
// server/api/login.post.ts
import { useSession } from 'peta-auth/nuxt'

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: 'nuxt-session',
  })
  const body = await readBody(event)
  Object.assign(session, { user: body, loggedInAt: Date.now() })
  await session.save()
  return { ok: true }
})
```

Set `NUXT_SESSION_PASSWORD` in your `.env`.

---

## API

### `session` middleware (framework adapters)

Each adapter exports a `session(options)` function that reads the session from the incoming cookie and attaches it to the framework's context.

```ts
session({
  password: process.env.SESSION_SECRET!, // required, at least 32 chars
  cookieName: 'my-session',              // required
  ttl: 60 * 60 * 24 * 14,                // optional, default 14 days
  cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
})
```

Password rotation is supported via object syntax:

```ts
session({ password: { 1: 'old-pw', 2: 'new-pw' }, cookieName: 'my-session' })
// new cookies use key 2, old cookies still decrypt with key 1
```

### Typed sessions

Add a generic type parameter to get full IntelliSense on your session data:

```ts
// Hono
app.use('*', session<{ user: { name: string }; views: number }>({ password, cookieName }))
// c.var.session.user.name → string
// c.var.session.views     → number

// Elysia
app.use(session<{ user: { name: string } }>({ password, cookieName }))

// Nuxt
const session = await useSession<{ user: { name: string } }>(event, { password, cookieName })
```

Without a generic parameter, session data defaults to `Record<string, unknown>`.

### `requireSession()` guard

Returns 401 if the session has no user data. Optionally checks a specific session key:

```ts
// Guard on any session data
app.use('/api/*', requireSession())

// Guard on a specific key (e.g. session.userId must be truthy)
app.use('/admin/*', requireSession('userId'))
```

Works per-framework:

- **Hono**: `app.use('/protected/*', requireSession())` — path-patterned middleware
- **Elysia**: `app.use(requireSession())` — guards all routes defined after it
- **Nuxt**: `requireSession(event, session)` or `requireSession(event, session, 'userId')` — throws `createError({ statusCode: 401 })`

### Session object

```ts
interface IronSession {
  save(): Promise<void>         // seal & write the cookie
  destroy(): void               // clear data & expire the cookie
  updateConfig(opts): void      // change options for this request
  [key: string]: unknown        // your data
}
```

---

## JWT

Sign and verify HS256 JWTs using the same password infrastructure.

```ts
import { signJWT, verifyJWT } from 'peta-auth/jwt'

// Sign
const token = await signJWT({ userId: 42, role: 'admin' }, {
  password: process.env.JWT_SECRET!,
  exp: 3600,                       // optional, seconds from now
})

// Verify
const payload = await verifyJWT<{ userId: number; role: string }>(token, {
  password: process.env.JWT_SECRET!,
})
if (!payload) throw new Error('invalid or expired token')
```

- `exp` defaults to no expiry if omitted
- Supports password rotation (tries all keys on verify, signs with highest)
- Requires password at least 32 characters

---

## CSRF protection

Generate and validate CSRF tokens stored in the session.

```ts
import { generateCsrf, validateCsrf } from 'peta-auth/csrf'

// On a form page — generate token and store in session
const token = await generateCsrf(session)
await session.save()
// → render form with hidden field: <input name="_csrf" value="${token}" />

// On form submission — validate
if (!validateCsrf(session, body._csrf)) {
  throw new Error('CSRF mismatch')
}
```

- Uses `crypto.randomUUID()` for token generation
- Stores token in session under `_csrfToken` (configurable via `{ key: 'myKey' }`)
- You must call `session.save()` after `generateCsrf()`

---

## Password Reset

Helpers for forgot/reset password flows using short-lived JWTs.

```ts
import { createPasswordResetToken, verifyPasswordResetToken, resetPassword } from 'peta-auth'

// Generate a token (e.g., in a "forgot password" endpoint)
const token = await createPasswordResetToken(user.email, {
  password: process.env.SECRET!,
  exp: 3600,  // optional, default 1 hour
})
// → email token as a link: https://example.com/reset?token=${token}

// Verify a token (e.g., in a "reset password" endpoint)
const payload = await verifyPasswordResetToken(token, process.env.SECRET!)
if (!payload) throw new Error('Invalid or expired token')
// payload.userId → the email passed to createPasswordResetToken

// Combined: verify token + hash new password
const result = await resetPassword(token, newPassword, process.env.SECRET!)
if (!result) throw new Error('Invalid or expired token')
users.set(result.userId, { ...user, hash: result.hash })
```

---

## Low-level

```ts
import { createSessionFromAdapter, sealData, unsealData } from 'peta-auth'
import { hashPassword, verifyPassword } from 'peta-auth'
```

- **`createSessionFromAdapter<T>(adapter, options)`** — takes a `SessionAdapter` (`{ getCookie, setCookie }`). Used internally by all framework adapters.
- **`sealData(data, { password, ttl? })` / `unsealData<T>(seal, { password, ttl? })`** — encrypt/decrypt arbitrary data.
- **`hashPassword(password, { cost? })` / `verifyPassword(hash, password)`** — bcrypt hashing via `bcryptjs`. Default cost: 10.

---

## OAuth

```ts
import { defineOAuthGitHubEventHandler } from 'peta-auth/oauth/github'
import { defineOAuthGoogleEventHandler } from 'peta-auth/oauth/google'
```

Each returns a `(request: Request) => Promise<Response>` handler — framework-agnostic.

```ts
import { defineOAuthGitHubEventHandler } from 'peta-auth/oauth/github'
import { session } from 'peta-auth/hono'

const app = new Hono()
app.use('*', session({ password: process.env.SESSION_SECRET!, cookieName: 'my-session' }))

const githubHandler = defineOAuthGitHubEventHandler({
  config: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
  async onSuccess({ user, tokens }) {
    return new Response(null, { status: 302, headers: { Location: '/' } })
  },
})

app.get('/auth/github', async (c) => githubHandler(c.req.raw))
```

Requires env vars: `PETA_OAUTH_GITHUB_CLIENT_ID`, `PETA_OAUTH_GITHUB_CLIENT_SECRET` (or `PETA_OAUTH_GOOGLE_*`).

The `onSuccess` callback receives `request: Request` — create a session from the raw request inside the handler:

```ts
import { createSessionFromAdapter } from 'peta-auth'
import { parse } from 'cookie'

async onSuccess({ user, tokens, request }) {
  const res = new Response(null, { status: 302, headers: { Location: '/' } })
  const session = await createSessionFromAdapter({
    getCookie: (name) => parse(request.headers.get('cookie') ?? '')[name],
    setCookie: (v) => res.headers.append('Set-Cookie', v),
  }, { password: process.env.SESSION_SECRET!, cookieName: 'my-session' })
  session.user = { id: user.id, login: user.login }
  await session.save()
  return res
}
```

---

## Examples

Full runnable examples in [`examples/`](./examples). All work with zero config (demo password fallback built in):

```bash
bun run examples/hono-basic.ts           # Hono — session CRUD, views counter
bun run examples/hono-guard.ts           # Hono — requireSession guard
bun run examples/elysia-basic.ts         # Elysia — session CRUD, views counter
bun run examples/elysia-guard.ts         # Elysia — requireSession guard
bun run examples/password-auth.ts        # Hono — signup + login with bcrypt
bun run examples/password-reset.ts       # Hono — forgot/reset password flow
bun run examples/jwt-basic.ts            # JWT sign + verify + tamper detection
bun run examples/csrf-basic.ts           # Hono — CSRF token form example
bun run examples/oauth-github.ts         # Hono — GitHub OAuth
bun run examples/oauth-google.ts         # Hono — Google OAuth (PKCE)
bun run examples/elysia-password.ts      # Elysia — signup + login with bcrypt
bun run examples/elysia-oauth-github.ts  # Elysia — GitHub OAuth
bun run examples/elysia-oauth-google.ts  # Elysia — Google OAuth (PKCE)
cd examples/nuxt                         # Nuxt — server routes with useSession
```

---

## How it works

Session data is serialized, encrypted with AES-256-CBC, integrity-protected with HMAC-SHA256, and stored in a single cookie. The session is **stateless** — no database, no Redis, no server-side storage.

- `session.save()` — seals the current data into the cookie
- `session.destroy()` — clears data and expires the cookie
- Multiple mutations can be made before `save()` — only one seal operation
- Cookie size limit of 4096 bytes applies (throws if exceeded)

---

## Scripts

```bash
bun test            # 74 tests across 12 files
bun run build       # tsdown → dist/ (21 files, 30 kB)
bun run prepublish  # build + publish
```

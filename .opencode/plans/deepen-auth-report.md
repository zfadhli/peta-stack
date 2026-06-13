# Deepen Review — peta-auth

**Project:** peta-auth v0.1.3 · **Files analyzed:** 12 source files · **Candidates found:** 5  
*Diagnostic lens: Evan You coding style · Seam vocabulary: Matt Pocock*

---

## Summary

| Strength | Count |
|----------|-------|
| 🟢 Strong | 3 |
| 🟡 Worth exploring | 2 |
| ⚪ Speculative | 0 |

**Health check:** The package is already quite clean — function-based, no `any` in production code, only 1 class (a value object), no string throws, no god files. The friction is concentrated in **small duplicated patterns** across the adapters and OAuth modules.

---

## Candidate 1 — Eliminate duplicated `normalizePassword`

**Files:** `src/crypto.ts:49` · `src/jwt.ts:5`  
**Strength:** 🟢 Strong · **Effort:** Tiny · **Non-breaking**

**Principles:** Modular, Minimal API

### Problem
`jwt.ts` re-implements `toPasswordMap` (lines 5-7) which is byte-for-byte identical to `crypto.ts`'s `normalizePassword` (lines 49-51). The **deletion test** fails: delete `jwt.ts`'s copy, and the complexity doesn't reappear — it's already in `crypto.ts`. The duplicated code is a maintenance hazard: if the password format changes, both copies must be updated.

### Solution
Delete `toPasswordMap` from `jwt.ts` and import `normalizePassword` from `crypto.ts` (which is already exported as `Password` type). Change the call site from `toPasswordMap(options.password)` to `normalizePassword(options.password)`.

```ts
// Before in jwt.ts:
function toPasswordMap(password: Password): Record<string, string> {
  return typeof password === "string" ? { 1: password } : password
}
// ... usage:
const map = toPasswordMap(options.password)

// After:
import { normalizePassword } from "./crypto.js"
// ... usage:
const map = normalizePassword(options.password)
```

### Benefits
- **Locality**: password normalization lives in one place (crypto.ts)
- **Leverage**: callers get the complexity without re-implementing it
- **Deletion test**: removing jwt.ts's copy doesn't reintroduce the pattern elsewhere

---

## Candidate 2 — Extract session key-filtering to shared utility

**Files:** `src/hono.ts:50` · `src/elysia.ts:54` · `src/nuxt.ts:58`  
**Strength:** 🟢 Strong · **Effort:** Tiny · **Non-breaking**

**Principles:** Modular, Separation of concerns

### Problem
The same expression `Object.keys(s).some((k) => k !== "save" && k !== "destroy" && k !== "updateConfig")` is triplicated verbatim across all three framework adapters. Each adapter independently recreates this logic — a change to the session method set requires changes in 3 files. The **deletion test**: if any adapter loses this check, `requireSession` silently accepts method keys as session data.

### Solution
Export a utility function from `session.ts`:

```ts
/** @internal Check if a session has any user data keys beyond the built-in methods. */
export function sessionHasData(session: IronSession, key?: string): boolean {
  if (key) return (session as any)[key] !== undefined
  return Object.keys(session).some((k) => k !== "save" && k !== "destroy" && k !== "updateConfig")
}
```

Then replace all 3 adapter copies with `sessionHasData(session, key)`.

### Benefits
- **Locality**: session data-checking logic lives in session.ts where it belongs
- **Leverage**: 3 call sites reduced to 1 import each
- **Deletion test**: deleting the function from session.ts would force 3 files to re-create it

---

## Candidate 3 — Rename `oauth/index.ts` → `oauth/utils.ts`

**Files:** `src/oauth/index.ts` (199 lines)  
**Strength:** 🟢 Strong · **Effort:** Tiny · **Non-breaking**

**Principles:** Minimal API, Descriptive names

### Problem
`src/oauth/index.ts` is not a barrel file — it contains 199 lines of shared OAuth utility logic (PKCE, state management, token exchange, redirect, error handling). Its name suggests it aggregates sub-modules, but it's a utilities module. This is misleading: a developer looking for the "barrel entry point" finds a wall of logic, and a developer looking for utilities doesn't look in `index.ts`.

### Solution
Rename to `oauth/utils.ts`. Update imports in `oauth/github.ts` and `oauth/google.ts`:

```ts
// Before in github.ts/google.ts:
import { ... } from "./index.js"

// After:
import { ... } from "./utils.js"
```

The public API (imported via `peta-auth/oauth/github` etc.) is unaffected. The re-export is `src/index.ts` which doesn't export from `oauth/index.ts`.

### Benefits
- **Descriptive name**: `utils.ts` signals this is a utilities module
- **Locality**: barrel files stay pure; logic files have descriptive names
- **Deletion test**: if utils.ts is deleted, github.ts and google.ts break — confirming they depend on it

---

## Candidate 4 — Extract OAuth error-response helper

**Files:** `src/oauth/index.ts:163,180,195` · `src/oauth/github.ts:85` · `src/oauth/google.ts:87`  
**Strength:** 🟡 Worth exploring · **Effort:** Small · **Non-breaking**

**Principles:** Modular, Minimal API

### Problem
The pattern `new Response(JSON.stringify({ error: error.message }), { status: <CODE>, headers: { "Content-Type": "application/json" } })` is repeated 5 times across the OAuth modules. Each repetition chooses a different HTTP status code (500 vs 401). The **deletion test**: if you delete this pattern, 5 call sites need to reconstruct it — but the complexity is trivial (2 lines).

### Solution
Add a helper function:

```ts
function jsonErrorResponse(error: Error, status: number): Response {
  return new Response(JSON.stringify({ error: error.message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
```

Place it in `oauth/utils.ts` (formerly `oauth/index.ts`). Replace the 5 inline constructions.

### Benefits
- **Locality**: response formatting lives in one place
- **Leverage**: callers just pass error + status
- **Moderate**: the pattern is simple, but 5 repetitions make it worth extracting

---

## Candidate 5 — OAuth provider base handler

**Files:** `src/oauth/github.ts` (177 lines) · `src/oauth/google.ts` (158 lines)  
**Strength:** 🟡 Worth exploring · **Effort:** Medium · **Non-breaking**

**Principles:** Modular, Separation of concerns

### Problem
The two OAuth providers share ~80% structural overlap: parse query → handle error → validate config → determine redirectURL → handle state → if no code, redirect → validate state → request token → handle token error → fetch user → call onSuccess. This is duplicated logic, not just duplicated code — the entire control flow is copied. A bug in the token exchange flow for GitHub must be fixed independently for Google.

### Solution
Extract a shared `defineOAuthHandler` base in `oauth/utils.ts` that accepts provider-specific callbacks:

```ts
interface OAuthProviderConfig {
  authUrl(params: URLSearchParams): string
  requestAccessToken(code: string, redirectURL: string): Promise<...>
  fetchUser(accessToken: string): Promise<...>
}

export async function defineOAuthHandler(
  event: ...,
  config: ...,
  provider: OAuthProviderConfig,
): Promise<Response | undefined> { ... }
```

Both `github.ts` and `google.ts` then become thin wrappers (30-40 lines each) that just provide the provider-specific callbacks.

### Benefits
- **Locality**: the OAuth flow logic lives in one place
- **Leverage**: adding a new provider (e.g., `oauth/facebook.ts`) is ~30 lines
- **Deletion test**: `github.ts` without the base handler would be 177 lines of flow logic

---

## 🏆 Top Recommendation

**Candidate 2 — Extract session key-filtering to shared utility.** It eliminates a triplicated pattern across all 3 adapters in <5 minutes, with immediate payoff for maintainability. The `sessionHasData` function is a natural addition to `session.ts` where the `IronSession` interface is defined.

*Effort: Tiny · Non-breaking · ~5 minutes*

---

## Which candidate would you like to explore?

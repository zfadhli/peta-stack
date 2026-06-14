# Plan: Comprehensive peta-stack documentation site — 2026-06-14

## Approach
Set up Vitepress in `docs/` directory and create ~20 focused pages covering cross-package integration patterns, architecture, guides, and design decisions. Content synthesizes from existing READMEs plus new writing. `docs/` supplements, does not replace, package READMEs.

## Steps

**Phase 1: Scaffold**
1. **Init Vitepress** — `mkdir docs`, create `docs/package.json` + `docs/.vitepress/config.mts` + `docs/index.md`. Default theme, full sidebar nav covering all 4 packages + apps + guides.
2. **Root scripts** — Add `docs:dev`/`docs:build` to root `package.json`.

**Phase 2: Core Guide Pages**
3. **docs/guide/getting-started.md** — Install, minimal full-stack example (ORM + Auth + Docs in one app), project layout.
4. **docs/guide/architecture.md** — Monorepo layout, package boundaries, dependency graph, workspace resolution, design philosophy (Laravel-inspired, modular, ArkType-first).
5. **docs/guide/integration.md** — Cross-package composition: Auth sessions + ORM models + Docs spec generation in a real app. Code walkthrough.
6. **docs/guide/testing.md** — Testing per package: unit (SQLite), integration (Docker PG/MySQL), app tests (conduit/catalog patterns).

**Phase 3: Package Deep-Dives (fill README gaps)**
7. **docs/packages/orm/plugins.md** — Plugin authoring guide: lifecycle hooks, state management, custom plugin patterns. README covers usage but not authoring.
8. **docs/packages/orm/query-builder.md** — Query builder internals: `when`/`unless` mechanics, extension points, raw queries, perf tips.
9. **docs/packages/auth/security.md** — Security hardening: cookie flags, CSP, rate-limiting, OAuth redirect validation, token refresh. README covers API not ops.
10. **docs/packages/docs/customization.md** — OpenAPI output customization: tags, servers, security schemes. Custom `RouteScanner` for non-Hono frameworks.
11. **docs/packages/migrate/advanced.md** — Advanced migrations: rollback strategies, data migrations, seed patterns, multi-DB, troubleshooting. README is thin.

**Phase 4: Reference**
12. **docs/reference/cli.md** — All CLI commands across all packages.
13. **docs/reference/env.md** — Environment variables reference (all packages, all adapters).
14. **docs/reference/faq.md** — Common questions, troubleshooting patterns.

**Phase 5: Polish**
15. **docs/index.md** — Hero page with tagline, feature cards, quick links.
16. **Link from root README** — Add docs badge/section in `README.md`.

## Files Created
```
docs/
├── .vitepress/
│   └── config.mts
├── index.md
├── guide/
│   ├── getting-started.md
│   ├── architecture.md
│   ├── integration.md
│   └── testing.md
├── packages/
│   ├── orm/
│   │   ├── plugins.md
│   │   └── query-builder.md
│   ├── auth/
│   │   └── security.md
│   ├── docs/
│   │   └── customization.md
│   └── migrate/
│       └── advanced.md
└── reference/
    ├── cli.md
    ├── env.md
    └── faq.md
```

## Files Modified
- `package.json` (root) — add `docs:dev`/`docs:build` scripts
- `README.md` (root) — add docs badge/link

## Verification
- `bun docs:dev` — starts clean, nav/sidebar navigable
- `bun docs:build` — builds without errors
- `bun test` — unaffected
- `bun run typecheck` — unaffected
- Internal links: every `[text](./path)` resolves to an existing `.md`

## Unresolved
- Theme customization? → Default theme. No custom theme for v1.
- Hosting? → Out of scope. Build output at `docs/.vitepress/dist/` — deployable to GitHub Pages later.

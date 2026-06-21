import { readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { Hono } from "hono"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a directory name to a URL path segment.
 *   `[id]` → `:id`
 *   `[postId]` → `:postId`
 *   `pets` → `pets`
 */
function toPathSegment(entry: string): string {
  const match = entry.match(/^\[(\w+)\]$/)
  return match ? `:${match[1]!}` : entry
}

function hasIndex(dir: string): boolean {
  try {
    return statSync(join(dir, "index.ts")).isFile()
  } catch {
    return false
  }
}

/**
 * Recursively walk a directory tree, mounting Hono sub-routers as they are
 * discovered. Directories named `[param]` become `:param` path segments.
 *
 * When a directory has no `index.ts` the accumulated path builds up,
 * and any router found deeper is mounted at the full accumulated prefix
 * on the original parent router (the "gap" pattern).
 *
 * @internal
 *
 * // eslint-disable-next-line @typescript-eslint/no-explicit-any
 * `Hono<any, any, any>` is required because filesystem discovery can't
 * know the type parameters of the Hono app at build time.
 */
type AnyHono = Hono<any, any, any>

async function walkDir(parentRouter: AnyHono, dir: string, accumulatedPath: string): Promise<void> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    if (!statSync(fullPath).isDirectory()) continue
    if (entry.startsWith(".") || entry === "node_modules") continue

    const segment = toPathSegment(entry)

    if (hasIndex(fullPath)) {
      try {
        const mod = await import(join(fullPath, "index.ts"))
        const router: unknown = mod.default ?? mod.routes ?? mod.router
        const honoRouter: AnyHono | null =
          router instanceof Hono ? router : typeof router === "function" ? router() : null

        if (honoRouter) {
          await walkDir(honoRouter, fullPath, "")
          const mountPath = accumulatedPath ? `${accumulatedPath}/${segment}` : `/${segment}`
          parentRouter.route(mountPath, honoRouter)
        }
      } catch (err) {
        console.warn(
          `[peta-docs] could not load routes from "${entry}": ${err instanceof Error ? err.message : err}`,
        )
      }
    } else {
      const nextPath = accumulatedPath ? `${accumulatedPath}/${segment}` : `/${segment}`
      await walkDir(parentRouter, fullPath, nextPath)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load routes from a directory tree. Each subdirectory with an `index.ts`
 * exporting a Hono instance (default export) is mounted as a sub-router.
 *
 * Directories named `[param]` are converted to `:param` path segments for
 * dynamic routing. Directories without `index.ts` accumulate their path
 * until a child directory with `index.ts` is found (gap pattern).
 *
 * Convention:
 *   routes/
 *     pets/
 *       index.ts          mounted at {basePath}/pets
 *       [id]/
 *         index.ts        mounted at {basePath}/pets/:id
 *         comments/
 *           index.ts      mounted at {basePath}/pets/:id/comments
 *     species/
 *       index.ts          mounted at {basePath}/species
 *
 * @param app    Hono application to mount routes on
 * @param dir    Path to the routes directory
 * @param options.basePath  URL prefix (default "/api")
 */
export async function loadRoutes(
  app: AnyHono,
  dir: string,
  options?: { basePath?: string },
): Promise<void> {
  const basePath = (options?.basePath ?? "/api").replace(/\/+$/, "")
  const resolvedDir = resolve(dir)

  try {
    readdirSync(resolvedDir)
  } catch {
    console.warn(`[peta-docs] could not read routes directory: ${dir}`)
    return
  }

  await walkDir(app, resolvedDir, basePath)
}

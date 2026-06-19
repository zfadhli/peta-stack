import { resolve } from "node:path"
import type { ModelDefinition } from "peta-orm"
import type { PetaMigrateConfig, ResolvedConfig } from "./types.js"

export function defineConfig(config: PetaMigrateConfig): PetaMigrateConfig {
  return config
}

export async function loadConfig(): Promise<ResolvedConfig> {
  const candidates = ["peta.config.ts", "peta.config.js", "peta.config.mjs"]
  let mod: Record<string, unknown> | null = null
  for (const file of candidates) {
    try {
      mod = (await import(resolve(process.cwd(), file))) as Record<string, unknown>
      break
    } catch {}
  }
  if (!mod) throw new Error("No peta.config.ts found. Create one in your project root.")
  const config = (mod.default ?? mod) as PetaMigrateConfig
  return { migrationsDir: config.migrationsDir, models: config.models, getKysely: config.getKysely }
}

export async function loadMigrationFiles(dir: string): Promise<import("./types.js").MigrationFile[]> {
  const { readdirSync } = await import("node:fs")
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .sort()
  const migrations: import("./types.js").MigrationFile[] = []
  for (const file of files) {
    const mod = (await import(resolve(dir, file))) as {
      up?: (db: unknown) => Promise<void>
      down?: (db: unknown) => Promise<void>
    }
    if (mod.up)
      migrations.push({ name: file.replace(/\.(ts|js)$/, ""), up: mod.up, down: mod.down ?? (async () => {}) })
  }
  return migrations
}

/**
 * Load model definitions from glob patterns.
 * Dynamically imports each matched file and collects ModelDefinition exports.
 * Models are keyed by their `.name` property.
 */
export async function loadModels(patterns: string | string[]): Promise<Map<string, ModelDefinition>> {
  const modelMap = new Map<string, ModelDefinition>()
  const patternList = Array.isArray(patterns) ? patterns : [patterns]
  const cwd = process.cwd()

  for (const raw of patternList) {
    let pattern = raw
    // Resolve relative to cwd if not absolute
    if (!pattern.startsWith("/")) {
      pattern = resolve(cwd, pattern)
    }
    // Use Bun.Glob for cross-platform glob matching
    const glob = new Bun.Glob(pattern)
    const files = Array.from(glob.scanSync(cwd))
    for (const file of files) {
      const fullPath = resolve(cwd, file)
      try {
        const mod = await import(fullPath)
        for (const value of Object.values(mod) as Record<string, unknown>[]) {
          if (isModelDefinition(value)) {
            if (!modelMap.has(value.name)) {
              modelMap.set(value.name, value)
            }
          }
        }
      } catch (err) {
        console.warn(`⚠ Failed to load model file "${fullPath}":`, (err as Error).message)
      }
    }
  }
  return modelMap
}

function isModelDefinition(value: unknown): value is ModelDefinition {
  if (value === null || value === undefined) return false
  const obj = value as Record<string, unknown>
  return typeof obj.table === "string" && obj.columns !== undefined && typeof obj.columns === "object"
}

import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { sync as globSync } from "fast-glob"
import type { ModelDefinition } from "peta-orm"
import type { PetaMigrateConfig } from "./types.js"

export async function loadConfig(): Promise<PetaMigrateConfig> {
  const candidates = ["peta.config.ts", "peta.config.js", "peta.config.mjs"]
  let mod: Record<string, unknown> | null = null
  for (const file of candidates) {
    try {
      mod = (await import(resolve(process.cwd(), file))) as Record<string, unknown>
      break
    } catch (err) {
      console.warn(`⚠ Failed to load config from "${file}":`, (err as Error).message)
    }
  }
  if (!mod) {
    const tried = candidates.map((f) => `\`${resolve(process.cwd(), f)}\``).join(", ")
    throw new Error(
      `No configuration file found. Tried: ${tried}.\n` +
        "Create one in your project root and export a PetaMigrateConfig object.",
    )
  }
  const config = (mod.default ?? mod) as PetaMigrateConfig
  return { migrationsDir: config.migrationsDir, models: config.models, getKysely: config.getKysely }
}

export async function loadMigrationFiles(
  dir: string,
): Promise<import("./types.js").MigrationFile[]> {
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Migrations directory "${dir}" not found. Run \`peta migrate:init\` to create it.`,
      )
    }
    throw err
  }
  files = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js")).sort()
  const migrations: import("./types.js").MigrationFile[] = []
  for (const file of files) {
    const mod = (await import(resolve(dir, file))) as {
      up?: (db: unknown) => Promise<void>
      down?: (db: unknown) => Promise<void>
    }
    if (mod.up)
      migrations.push({
        name: file.replace(/\.(ts|js)$/, ""),
        up: mod.up,
        down: mod.down ?? (async () => {}),
      })
  }
  return migrations
}

/**
 * Load model definitions from glob patterns.
 * Dynamically imports each matched file and collects ModelDefinition exports.
 * Models are keyed by their `.name` property.
 */
export async function loadModels(
  patterns: string | string[],
): Promise<Map<string, ModelDefinition>> {
  const modelMap = new Map<string, ModelDefinition>()
  const patternList = Array.isArray(patterns) ? patterns : [patterns]
  const cwd = process.cwd()

  for (const raw of patternList) {
    let pattern = raw
    // Resolve relative to cwd if not absolute
    if (!pattern.startsWith("/")) {
      pattern = resolve(cwd, pattern)
    }
    const files = globSync(pattern, { cwd, onlyFiles: true, dot: false })
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
  return (
    typeof obj.table === "string" && obj.columns !== undefined && typeof obj.columns === "object"
  )
}

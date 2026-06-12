import { resolve } from "node:path"
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

import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

// Functions under test — loaded dynamically in beforeAll
let loadConfig: (() => Promise<import("../src/types.js").PetaMigrateConfig>) | null = null
let loadMigrationFiles:
  | ((dir: string) => Promise<import("../src/types.js").MigrationFile[]>)
  | null = null
let loadModels: ((patterns: string | string[]) => Promise<Map<string, unknown>>) | null = null

const tmpRoot = resolve(import.meta.dirname, "../../.tmp/config-test")
let counter = 0

afterAll(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true })
  } catch {}
})

beforeAll(async () => {
  const mod = await import("../src/config.js")
  loadConfig = mod.loadConfig
  loadMigrationFiles = mod.loadMigrationFiles
  loadModels = mod.loadModels
})

// ─── loadMigrationFiles ──────────────────────────────────────────

describe("loadMigrationFiles", () => {
  it("returns migrations from a directory", async () => {
    const dir = resolve(tmpRoot, `mig-files-${++counter}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, "001_test.ts"), `export async function up() {}`)
    writeFileSync(
      resolve(dir, "002_other.ts"),
      `export async function up(db: any) { await db.schema.createTable('x').execute() }`,
    )

    const migrations = await loadMigrationFiles!(dir)
    expect(migrations).toHaveLength(2)
    expect(migrations[0]!.name).toBe("001_test")
    expect(migrations[1]!.name).toBe("002_other")
    expect(typeof migrations[0]!.up).toBe("function")
  })

  it("returns empty array for empty directory", async () => {
    const dir = resolve(tmpRoot, `empty-${++counter}`)
    mkdirSync(dir, { recursive: true })

    const migrations = await loadMigrationFiles!(dir)
    expect(migrations).toEqual([])
  })

  it("throws friendly message for missing directory", async () => {
    const missingDir = resolve(tmpRoot, `nope-${++counter}`)

    expect(loadMigrationFiles!(missingDir)).rejects.toThrow("migrate:init")
  })
})

// ─── loadConfig ──────────────────────────────────────────────────

describe("loadConfig", () => {
  it("loads config from peta.config.ts", async () => {
    const dir = resolve(tmpRoot, `cfg-valid-${++counter}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      resolve(dir, "peta.config.ts"),
      [
        `import type { PetaMigrateConfig } from "../../src/types.js"`,
        `export default { migrationsDir: "./migrations", models: "./models/*.ts", getKysely: () => ({}) } satisfies PetaMigrateConfig`,
      ].join("\n"),
    )

    const origCwd = process.cwd
    process.cwd = () => dir
    try {
      const config = await loadConfig!()
      expect(config.migrationsDir).toBe("./migrations")
      expect(config.models).toBe("./models/*.ts")
      expect(typeof config.getKysely).toBe("function")
    } finally {
      process.cwd = origCwd
    }
  })

  it("throws with tried paths when no config exists", async () => {
    const dir = resolve(tmpRoot, `no-cfg-${++counter}`)
    mkdirSync(dir, { recursive: true })

    const origCwd = process.cwd
    process.cwd = () => dir
    try {
      await expect(loadConfig!()).rejects.toThrow("No configuration file found")
      await expect(loadConfig!()).rejects.toThrow("Tried")
    } finally {
      process.cwd = origCwd
    }
  })
})

// ─── loadModels ──────────────────────────────────────────────────

describe("loadModels", () => {
  it("returns empty map when no files match the pattern", async () => {
    const dir = resolve(tmpRoot, `no-models-${++counter}`)
    mkdirSync(dir, { recursive: true })

    // Point at a dir with no model files
    const models = await loadModels!([`${dir}/*.ts`])
    expect(models.size).toBe(0)
  })
})

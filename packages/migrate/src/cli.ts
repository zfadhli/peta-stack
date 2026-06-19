import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import cac from "cac"
import ora from "ora"
import { loadConfig, loadMigrationFiles, loadModels } from "./config.js"
import { createMigrationGenerator } from "./generator.js"
import { createMigrationRunner } from "./runner.js"
import { createSnapshot, loadSnapshot, saveSnapshot } from "./snapshot.js"
import { diffSnapshots } from "./differ.js"
import { computeChecksum, loadChecksums, saveChecksums, verifyChecksum } from "./checksum.js"

export async function run(): Promise<void> {
  const cli = cac("peta")

  cli.command("migrate:init", "Create migrations directory and tracking table").action(async () => {
    const config = await loadConfig()
    const spinner = ora("Setting up migrations...").start()
    mkdirSync(config.migrationsDir, { recursive: true })
    await createMigrationRunner(config.getKysely() as never).ensureTable()
    spinner.succeed(`Migrations directory created at ${config.migrationsDir}`)
  })

  cli.command("migrate:generate [name]", "Generate migration from models (initial or incremental)").action(async (name?: string) => {
    const config = await loadConfig()
    const spinner = ora("Loading models...").start()
    const models = await loadModels(config.models)
    if (models.size === 0) {
      spinner.warn("No models found matching the configured patterns.")
      return
    }
    spinner.text = "Generating migration..."
    const gen = createMigrationGenerator()
    const snapshotPath = resolve(config.migrationsDir, "snapshot.json")
    const prevSnapshot = await loadSnapshot(snapshotPath)

    let code: string
    if (prevSnapshot) {
      const currentSnapshot = createSnapshot(models)
      const diffs = diffSnapshots(prevSnapshot, currentSnapshot)
      if (diffs.length === 0) {
        spinner.succeed("No schema changes detected since last snapshot.")
        return
      }
      code = gen.generateMigrationFromDiff(diffs, { name: name ?? "changes" })
      await saveSnapshot(snapshotPath, currentSnapshot)
      spinner.text = `Generated incremental migration (${diffs.length} change(s))`
    } else {
      code = gen.generateInitialMigration(models)
      const currentSnapshot = createSnapshot(models)
      await saveSnapshot(snapshotPath, currentSnapshot)
      spinner.text = `Generated initial migration (${models.size} model(s))`
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14)
    const safeName = (name ?? "initial").replace(/[^a-zA-Z0-9_]/g, "_")
    const filename = resolve(config.migrationsDir, `${timestamp}_${safeName}.ts`)
    mkdirSync(config.migrationsDir, { recursive: true })
    writeFileSync(filename, code)

    // Record checksum
    const checksums = loadChecksums(config.migrationsDir)
    const fileName = `${timestamp}_${safeName}.ts`
    checksums[fileName.replace(/\.(ts|js)$/, "")] = computeChecksum(filename)
    saveChecksums(config.migrationsDir, checksums)

    spinner.succeed(`Created ${filename}`)
  })

  cli.command("migrate:diff", "Preview schema changes without writing a migration").action(async () => {
    const config = await loadConfig()
    const snapshotPath = resolve(config.migrationsDir, "snapshot.json")
    const prevSnapshot = await loadSnapshot(snapshotPath)
    if (!prevSnapshot) {
      console.log("No snapshot found. Run `migrate:generate` first to create one.")
      return
    }
    const spinner = ora("Loading models...").start()
    const models = await loadModels(config.models)
    spinner.stop()
    if (models.size === 0) {
      console.log("No models found.")
      return
    }
    const currentSnapshot = createSnapshot(models)
    const diffs = diffSnapshots(prevSnapshot, currentSnapshot)
    if (diffs.length === 0) {
      console.log("✅ No schema changes detected.")
      return
    }
    console.log(`\n  📋 Schema changes: ${diffs.length}\n`)
    for (const d of diffs) {
      const icon = d.type.startsWith("drop") ? "🗑️" : d.type.startsWith("create") || d.type.startsWith("add") ? "➕" : "✏️"
      console.log(`  ${icon} [${d.type}] ${d.table}${d.column ? `.${d.column}` : ""}`)
    }
    console.log()
  })

  cli.command("migrate:up", "Apply pending migrations").action(async () => {
    const config = await loadConfig()
    const migrations = await loadMigrationFiles(config.migrationsDir)
    if (migrations.length === 0) {
      console.log("No migration files found.")
      return
    }

    // Verify checksums for already-applied migrations
    const checksums = loadChecksums(config.migrationsDir)
    for (const m of migrations) {
      const filePath = resolve(config.migrationsDir, `${m.name}.ts`)
      if (!verifyChecksum(config.migrationsDir, m.name, filePath)) {
        console.error(`❌ Checksum mismatch for migration "${m.name}". File has been modified since creation.`)
        process.exit(1)
      }
    }

    const runner = createMigrationRunner(config.getKysely() as never)
    const status = await runner.status(migrations)
    if (status.pending.length === 0) {
      console.log("All migrations have been applied.")
      return
    }
    const spinner = ora(`Running ${status.pending.length} migration(s)...`).start()
    await runner.up(migrations)
    spinner.succeed(`Applied ${(await runner.getCompleted()).length} migration(s)`)
  })

  cli.command("migrate:down [steps]", "Rollback migrations (default: 1)").action(async (steps?: string) => {
    const config = await loadConfig()
    const migrations = await loadMigrationFiles(config.migrationsDir)
    if (migrations.length === 0) {
      console.log("No migration files found.")
      return
    }
    const runner = createMigrationRunner(config.getKysely() as never)
    const completed = await runner.getCompleted()
    if (completed.length === 0) {
      console.log("Nothing to rollback.")
      return
    }

    const numSteps = steps ? Number.parseInt(steps, 10) : 1
    if (Number.isNaN(numSteps) || numSteps < 1) {
      console.error("Steps must be a positive integer.")
      process.exit(1)
    }

    const spinner = ora(`Rolling back ${numSteps} migration(s)...`).start()

    // Rollback in batches of `numSteps` by calling down repeatedly
    for (let i = 0; i < numSteps; i++) {
      const currentCompleted = await runner.getCompleted()
      if (currentCompleted.length === 0) break
      await runner.down(migrations)
    }

    spinner.succeed(`Rolled back ${numSteps} migration(s)`)
  })

  cli.command("migrate:status", "Show migration status").action(async () => {
    const config = await loadConfig()
    const migrations = await loadMigrationFiles(config.migrationsDir)
    const { completed, pending } = await createMigrationRunner(config.getKysely() as never).status(migrations)
    console.log(`\n  Completed: ${completed.length}`)
    for (const m of completed) console.log(`    ✓ ${m.name}`)
    console.log(`\n  Pending: ${pending.length}`)
    for (const m of pending) console.log(`    · ${m.name}`)
    console.log()
  })

  cli.command("migrate:push", "Push schema directly to database (prototyping)").action(async () => {
    const config = await loadConfig()
    const spinner = ora("Loading models...").start()
    const models = await loadModels(config.models)
    if (models.size === 0) {
      spinner.warn("No models found.")
      return
    }
    spinner.text = "Pushing schema to database..."
    const { pushSchema } = await import("./pusher.js")
    const created = await pushSchema(config.getKysely() as never, models)

    // Update snapshot if it exists
    const snapshotPath = resolve(config.migrationsDir, "snapshot.json")
    const currentSnapshot = createSnapshot(models)
    await saveSnapshot(snapshotPath, currentSnapshot)

    if (created.length === 0) {
      spinner.succeed("Schema is up to date (no new tables).")
    } else {
      spinner.succeed(`Created tables: ${created.join(", ")}`)
    }
  })

  cli.command("migrate:seed [name]", "Generate or run seed files").action(async (name?: string) => {
    const config = await loadConfig()
    if (name) {
      // Generate a seed file
      const spinner = ora("Generating seed...").start()
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.Z]/g, "")
        .slice(0, 14)
      const safeName = name.replace(/[^a-zA-Z0-9_]/g, "_")
      const filename = resolve(config.migrationsDir, `${timestamp}_seed_${safeName}.ts`)
      const code = `import type { Kysely } from "kysely"\n\nexport async function seed(db: Kysely<any>): Promise<void> {\n  // TODO: add seed data\n}\n`
      writeFileSync(filename, code)
      spinner.succeed(`Created ${filename}`)
    } else {
      // Run seed files
      const { readdirSync } = await import("node:fs")
      const spinner = ora("Running seeds...").start()
      const seedFiles = readdirSync(config.migrationsDir)
        .filter((f) => f.includes("_seed_") && (f.endsWith(".ts") || f.endsWith(".js")))
        .sort()

      if (seedFiles.length === 0) {
        spinner.warn("No seed files found.")
        return
      }

      for (const file of seedFiles) {
        const mod = await import(resolve(config.migrationsDir, file)) as {
          seed?: (db: unknown) => Promise<void>
        }
        if (mod.seed) {
          await mod.seed(config.getKysely() as never)
        }
      }
      spinner.succeed(`Executed ${seedFiles.length} seed(s)`)
    }
  })

  cli.help()
  cli.parse()
}

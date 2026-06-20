import type { Kysely } from "kysely"

export interface MigrationFile {
  name: string
  up: (db: Kysely<unknown>) => Promise<void>
  down: (db: Kysely<unknown>) => Promise<void>
}

export interface MigrationRecord {
  name: string
  appliedAt: string
}

export interface MigrationStatus {
  completed: MigrationRecord[]
  pending: MigrationFile[]
}

export interface PetaMigrateConfig {
  migrationsDir: string
  models: string[] | string
  getKysely: () => Kysely<unknown>
}

// ─── Schema Snapshot Types ──────────────────────────────────

export interface SchemaColumn {
  name: string
  type: string
  isNullable: boolean
  isPrimaryKey: boolean
  isUnique: boolean
  defaultValue: unknown
  references?: { table: string; column: string }
}

export interface SchemaIndex {
  name: string
  columns: string[]
  unique?: boolean
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
  indexes: SchemaIndex[]
}

export interface SchemaSnapshot {
  version: 1
  tables: SchemaTable[]
}

export interface SchemaDiff {
  type: "createTable" | "dropTable" | "addColumn" | "dropColumn" | "alterColumn" | "addIndex" | "dropIndex"
  table: string
  column?: string
  details?: Record<string, unknown>
}

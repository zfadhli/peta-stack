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
export interface ResolvedConfig {
  migrationsDir: string
  models: string[] | string
  getKysely: () => Kysely<unknown>
}

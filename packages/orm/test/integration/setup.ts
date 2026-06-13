/**
 * Integration test setup — dialect-agnostic helpers for running tests
 * against PostgreSQL, MySQL, and SQLite.
 *
 * Bun supports top-level await in test files, so each test file can do:
 *
 *   import { getAvailableDialects, expect } from "./setup.js"
 *
 *   for (const dialect of await getAvailableDialects()) {
 *     describe(`[${dialect.label}] My group`, () => {
 *       let ctx: DialectContext
 *
 *       beforeAll(async () => {
 *         ctx = await dialect.create()
 *         await applySchemas(ctx.kysely, mySchemas)
 *       })
 *
 *       afterAll(async () => {
 *         await dropSchemas(ctx.kysely, mySchemas)
 *         await ctx.destroy()
 *       })
 *
 *       it("works", async () => {
 *         const orm = ctx.getORM()
 *         // ...
 *       })
 *     })
 *   }
 *
 * Environment variables:
 *   INTEGRATION_PG_URL    — PostgreSQL connection string
 *   INTEGRATION_MYSQL_URL — MySQL connection string
 *
 * Set INTEGRATION_SKIP_PG=1 or INTEGRATION_SKIP_MYSQL=1 to skip without connecting.
 */

import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Kysely, MysqlDialect, PostgresDialect, sql } from "kysely"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { createORM } from "../../src/index.js"

// ─── Re-exports ─────────────────────────────────────────────────────

export { afterAll, beforeAll, describe, expect, it, sql }

// ─── Types ──────────────────────────────────────────────────────────

export type SupportedDialect = "sqlite" | "postgres" | "mysql"

export interface DialectContext {
  dialect: SupportedDialect
  getORM: () => ReturnType<typeof createORM>
  kysely: Kysely<any>
  registerAll: (...models: any[]) => void
  destroy: () => Promise<void>
}

export interface SchemaDef {
  name: string
  up: (k: Kysely<any>) => Promise<void>
  down: (k: Kysely<any>) => Promise<void>
}

export interface DialectInfo {
  name: SupportedDialect
  label: string
  create: () => Promise<DialectContext>
}

// ─── Dialect Factories ──────────────────────────────────────────────

function createSqliteContext(): DialectContext {
  const database = new Database(":memory:")
  database.run("PRAGMA journal_mode = WAL")
  database.run("PRAGMA foreign_keys = ON")
  const dialect = new BunSqliteDialect({ database })
  const kysely = new Kysely<any>({ dialect })
  const orm = createORM({ dialect: dialect as any })
  return {
    dialect: "sqlite",
    getORM: () => orm,
    kysely,
    registerAll: (...models: any[]) => orm.registerAll(...models),
    destroy: async () => {
      await kysely.destroy()
      database.close()
    },
  }
}

async function createPostgresContext(): Promise<DialectContext> {
  const { Pool } = await import("pg")
  const pool = new Pool({
    connectionString: process.env.INTEGRATION_PG_URL || "postgres://postgres:postgres@localhost:5432/peta_orm_test",
    max: 1,
  })
  const dialect = new PostgresDialect({ pool })
  const kysely = new Kysely<any>({ dialect })
  const orm = createORM({ dialect: dialect as any })
  return {
    dialect: "postgres",
    getORM: () => orm,
    kysely,
    registerAll: (...models: any[]) => orm.registerAll(...models),
    destroy: async () => {
      await kysely.destroy()
      await pool.end().catch(() => {})
    },
  }
}

async function createMysqlContext(): Promise<DialectContext> {
  const mysql = await import("mysql2")
  const pool = mysql.createPool({
    uri: process.env.INTEGRATION_MYSQL_URL || "mysql://root:mysqlroot@localhost:3306/peta_orm_test",
    connectionLimit: 1,
  })
  const dialect = new MysqlDialect({ pool })
  const kysely = new Kysely<any>({ dialect })
  const orm = createORM({ dialect: dialect as any })
  return {
    dialect: "mysql",
    getORM: () => orm,
    kysely,
    registerAll: (...models: any[]) => orm.registerAll(...models),
    destroy: async () => {
      await kysely.destroy()
      await pool.end().catch(() => {})
    },
  }
}

// ─── Availability Detection ─────────────────────────────────────────

const DIALECTS: DialectInfo[] = [
  { name: "sqlite", label: "SQLite", create: async () => createSqliteContext() },
  { name: "postgres", label: "PostgreSQL", create: createPostgresContext },
  { name: "mysql", label: "MySQL", create: createMysqlContext },
]

let _available: DialectInfo[] | null = null

/**
 * Returns the list of dialects that are available.
 * - SQLite is always available.
 * - PostgreSQL is checked by connecting with a 3-second timeout.
 * - MySQL is checked by connecting with a 3-second timeout.
 * - Set INTEGRATION_SKIP_PG=1 or INTEGRATION_SKIP_MYSQL=1 to skip without connecting.
 *
 * Results are cached after the first call.
 */
export async function getAvailableDialects(options?: {
  skip?: SupportedDialect[]
  only?: SupportedDialect[]
}): Promise<DialectInfo[]> {
  if (_available) {
    return filterDialects(_available, options)
  }

  const results: DialectInfo[] = [DIALECTS[0]] // sqlite always available

  // Check PostgreSQL
  if (!process.env.INTEGRATION_SKIP_PG) {
    try {
      const ctx = await createPostgresContext()
      await sql`SELECT 1`.execute(ctx.kysely)
      await ctx.destroy()
      results.push(DIALECTS[1])
      console.log("  ✓ PostgreSQL available")
    } catch (e: any) {
      console.log("  ✗ PostgreSQL unavailable:", e.message)
    }
  } else {
    console.log("  - PostgreSQL skipped (INTEGRATION_SKIP_PG)")
  }

  // Check MySQL
  if (!process.env.INTEGRATION_SKIP_MYSQL) {
    try {
      const ctx = await createMysqlContext()
      await sql`SELECT 1`.execute(ctx.kysely)
      await ctx.destroy()
      results.push(DIALECTS[2])
      console.log("  ✓ MySQL available")
    } catch (e: any) {
      console.log("  ✗ MySQL unavailable:", e.message)
    }
  } else {
    console.log("  - MySQL skipped (INTEGRATION_SKIP_MYSQL)")
  }

  _available = results
  return filterDialects(results, options)
}

function filterDialects(
  list: DialectInfo[],
  options?: { skip?: SupportedDialect[]; only?: SupportedDialect[] },
): DialectInfo[] {
  return list.filter((d) => {
    if (options?.skip?.includes(d.name)) return false
    if (options?.only && !options.only.includes(d.name)) return false
    return true
  })
}

// ─── Schema Helpers ─────────────────────────────────────────────────

export async function applySchemas(kysely: Kysely<any>, schemas: SchemaDef[]): Promise<void> {
  for (const s of schemas) {
    try {
      await s.down(kysely)
    } catch {
      // Ignore drop errors
    }
    await s.up(kysely)
  }
}

export async function dropSchemas(kysely: Kysely<any>, schemas: SchemaDef[]): Promise<void> {
  const reversed = [...schemas].reverse()
  for (const s of reversed) {
    try {
      await s.down(kysely)
    } catch {
      // Ignore drop errors
    }
  }
}

// ─── Default Schemas ────────────────────────────────────────────────

export const userSchema: SchemaDef = {
  name: "users",
  up: async (k) => {
    await k.schema
      .createTable("users")
      .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .addColumn("email", "varchar(255)", (c) => c.notNull().unique())
      .addColumn("age", "integer", (c) => c.defaultTo(0))
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable("users").ifExists().execute()
  },
}

export const profileSchema: SchemaDef = {
  name: "profiles",
  up: async (k) => {
    await k.schema
      .createTable("profiles")
      .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
      .addColumn("userId", "integer", (c) => c.notNull())
      .addColumn("bio", "text")
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable("profiles").ifExists().execute()
  },
}

export const postSchema: SchemaDef = {
  name: "posts",
  up: async (k) => {
    await k.schema
      .createTable("posts")
      .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
      .addColumn("userId", "integer", (c) => c.notNull())
      .addColumn("title", "varchar(255)", (c) => c.notNull())
      .addColumn("body", "text")
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable("posts").ifExists().execute()
  },
}

export const commentSchema: SchemaDef = {
  name: "comments",
  up: async (k) => {
    await k.schema
      .createTable("comments")
      .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
      .addColumn("postId", "integer", (c) => c.notNull())
      .addColumn("userId", "integer", (c) => c.notNull())
      .addColumn("body", "text", (c) => c.notNull())
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable("comments").ifExists().execute()
  },
}

export const tagSchema: SchemaDef = {
  name: "tags",
  up: async (k) => {
    await k.schema
      .createTable("tags")
      .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable("tags").ifExists().execute()
  },
}

export const postTagSchema: SchemaDef = {
  name: "post_tags",
  up: async (k) => {
    await k.schema
      .createTable("post_tags")
      .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
      .addColumn("postId", "integer", (c) => c.notNull())
      .addColumn("tagId", "integer", (c) => c.notNull())
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable("post_tags").ifExists().execute()
  },
}

export const defaultSchemas: SchemaDef[] = [
  userSchema,
  profileSchema,
  postSchema,
  commentSchema,
  tagSchema,
  postTagSchema,
]

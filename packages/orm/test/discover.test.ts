import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const RestA = defineModel("rest_a", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const RestB = defineModel("rest_b", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const EmptyTable = defineModel("", {
  columns: { id: t.integer().primaryKey() },
})

let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  const client = createClient({ url: ":memory:" })
  await client.execute("CREATE TABLE rest_a (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
  await client.execute("CREATE TABLE rest_b (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
  peta = createPeta({ dialect: new LibsqlDialect({ client }) })
})

afterAll(async () => {
  await peta.destroy()
})

describe("registerAll rest params", () => {
  it("accepts rest params (no array)", () => {
    peta.registerAll(RestA, RestB)
    expect(peta.getModel("rest_a")).toBe(RestA)
    expect(peta.getModel("rest_b")).toBe(RestB)
  })

  it("still accepts array for backward compat", () => {
    const p = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    p.registerAll([RestA, RestB] as any)
    expect(p.getModel("rest_a")).toBe(RestA)
    expect(p.getModel("rest_b")).toBe(RestB)
    p.destroy()
  })

  it("is idempotent — calling again overrides", () => {
    const p = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    p.registerAll(RestA)
    p.registerAll(RestA, RestB)
    expect(p.getModel("rest_a")).toBe(RestA)
    expect(p.getModel("rest_b")).toBe(RestB)
    p.destroy()
  })

  it("skips models with empty table string (no throw)", () => {
    expect(() => peta.registerAll(EmptyTable)).not.toThrow()
  })
})

describe("discover", () => {
  it("discovers models from fixture directory", async () => {
    const models = await peta.discover("./test/fixtures/*.ts")
    expect(models).toHaveLength(1)
    expect(models[0]!.table).toBe("discovered")
    expect(models[0]!.columns).toHaveProperty("id")
    expect(models[0]!.columns).toHaveProperty("label")
    // Returned models can be registered
    peta.registerAll(...models)
    expect(peta.getModel("discovered")).toBe(models[0])
  })

  it("throws clear error when no files match", async () => {
    await expect(peta.discover("./test/fixtures/nonexistent/*.ts")).rejects.toThrow(
      'discover: no files matched pattern "./test/fixtures/nonexistent/*.ts"',
    )
  })
})

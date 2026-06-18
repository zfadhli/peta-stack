import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { createPeta, defineModel } from "../src/index.js"
import { createRepo } from "../src/repo/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const RepoUser = defineModel("repo_users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text(),
    role: t.string(50).default("user"),
    active: t.integer().default(1),
  },
})

let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  const client = createClient({ url: ":memory:" })
  await client.execute("PRAGMA journal_mode = WAL")
  await client.execute(
    "CREATE TABLE repo_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT DEFAULT 'user', active INTEGER DEFAULT 1)",
  )
  peta = createPeta({ dialect: new LibsqlDialect({ client }) })
  peta.registerAll(RepoUser)

  await RepoUser.insert({ name: "Alice", email: "alice@test.com", role: "admin" })
  await RepoUser.insert({ name: "Bob", email: "bob@test.com", role: "user" })
  await RepoUser.insert({ name: "Charlie", email: "charlie@test.com", role: "user" })
})

afterAll(async () => {
  await peta.destroy()
})

describe("Repository pattern", () => {
  it("queryMethods are chainable", async () => {
    const userRepo = createRepo(RepoUser, {
      queryMethods: {
        search(q, query: string) {
          return q.where("name", "like", `%${query}%`)
        },
        active(q) {
          return q.where("active", "=", 1)
        },
      },
    })

    const users = await userRepo.search("lice").active()
    expect(users).toHaveLength(1)
    expect(users[0]!.get("name")).toBe("Alice")
  })

  it("queryMethods compose with standard QB methods", async () => {
    const userRepo = createRepo(RepoUser, {
      queryMethods: {
        search(q, query: string) {
          return q.where("name", "like", `%${query}%`)
        },
      },
    })

    const users = await userRepo.search("Bob").orderBy("id", "asc").limit(1)
    expect(users).toHaveLength(1)
    expect(users[0]!.get("name")).toBe("Bob")
  })

  it("supports pagination through repo", async () => {
    const userRepo = createRepo(RepoUser, {
      queryMethods: {
        admins(q) {
          return q.where("role", "=", "admin")
        },
      },
    })

    const result = await userRepo.admins().paginate(1, 10)
    expect(result.total).toBeGreaterThanOrEqual(1)
  })

  it("plain methods work alongside query methods", async () => {
    const userRepo = createRepo(RepoUser, {
      methods: {
        greet(name: string) {
          return `Hello, ${name}!`
        },
      },
      queryMethods: {
        search(q, query: string) {
          return q.where("name", "like", `%${query}%`)
        },
      },
    })

    expect((userRepo as any).greet("World")).toBe("Hello, World!")
    const users = await (userRepo as any).search("Alice")
    expect(users).toHaveLength(1)
  })
})

describe("makeHelper", () => {
  it("creates reusable query helpers", async () => {
    const searchByName = RepoUser.makeHelper((qb: any, query: string) => {
      return qb.where("name", "like", `%${query}%`)
    })

    const users = await searchByName("Alice").orderBy("id", "asc")
    expect(users).toHaveLength(1)
    expect(users[0]!.get("name")).toBe("Alice")
  })

  it("helpers compose with standard QB methods", async () => {
    const searchByName = RepoUser.makeHelper((qb: any, query: string) => {
      return qb.where("name", "like", `%${query}%`)
    })

    const users = await searchByName("Bob").orderBy("id", "asc").limit(1)
    expect(users).toHaveLength(1)
    expect(users[0]!.get("name")).toBe("Bob")
  })
})

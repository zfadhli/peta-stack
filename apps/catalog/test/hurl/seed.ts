import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { hashPassword } from "peta-auth"
import { createTables, getORM } from "../../src/db/schema.js"

const db = new Database("catalog.db", { create: true })
db.run("PRAGMA foreign_keys = ON")
createTables(db)
const orm = getORM(new BunSqliteDialect({ database: db }))

const { User, Author, Category } = await import("../../src/db/schema.js")

// ── Users with different roles ────────────────────────────────────────
const ph = await hashPassword("password123")

await User.insert({ email: "admin@hurl.test", passwordHash: ph, name: "Admin", role: "admin" })
const authorUser = await User.insert({
  email: "author@hurl.test",
  passwordHash: ph,
  name: "Author User",
  role: "author",
})
const _user = await User.insert({ email: "user@hurl.test", passwordHash: ph, name: "Regular User", role: "user" })

// ── Author profiles ───────────────────────────────────────────────────
// Linked to author user (used for owner tests)
const linkedAuthor = await Author.insert({
  name: "Hurl Author",
  bio: "Hurl test author",
  userId: authorUser.get<string>("id"),
})
// Unlinked author (used for non-owner tests)
const unlinkedAuthor = await Author.insert({ name: "Other Author", bio: "No user link" })

console.log(linkedAuthor.get("id"), unlinkedAuthor.get("id"))

// ── A category ────────────────────────────────────────────────────────
await Category.insert({ name: "Hurl Category", description: "Test category" })

console.log("Seed complete")
await orm.destroy()
db.close()

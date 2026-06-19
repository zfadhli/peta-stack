import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { hashPassword } from "peta-auth"
import { createTables, getORM } from "../../src/db/schema.js"

const client = createClient({ url: "file:catalog.db" })
await client.execute("PRAGMA foreign_keys = ON")
await createTables(client)
const orm = await getORM(new LibsqlDialect({ client }))

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
client.close()

// Peta ORM — 32-accessors-mutators
// Attribute.make({ get, set }) — accessors and mutators for model attributes
//
// Accessors transform attribute values when read (via model.get() / $toJSON()).
// Mutators transform attribute values when written (via model.set() / fill() / insert()).
//
// Both receive (value, instance) — the current value and the model instance.

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { Attribute, t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Model with attribute transformations ──────────────────────

const User = defineModel("users_32", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().nullable(),
    password: t.string(255).nullable(),
    role: t.string(50).nullable().default("user"),
  },
  attributes: {
    // Get accessor: uppercase name on read
    // Set mutator: trim whitespace on write
    name: Attribute.make({
      set: (value: string) => value.trim(),
      get: (value: string) => value?.toUpperCase(),
    }),

    // Read-only: lowercases email on read, stores raw value on write
    email: Attribute.make({
      get: (value: string | null) => (value ? value.toLowerCase() : value),
    }),

    // Both: hashes password on write, masks on read
    password: Attribute.make({
      set: (value: string) => {
        // Simulate hashing — in production use bcrypt etc.
        return `hash_${value}`
      },
      get: () => "***",
    }),

    // Write-only: normalizes role to lowercase on write
    role: Attribute.make({
      set: (value: string) => value.toLowerCase(),
    }),
  },
})

// ─── Model without attributes (for comparison) ─────────────────

const PlainUser = defineModel("plain_users_32", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
  },
})

// ─── Setup ─────────────────────────────────────────────────────

const database = new Database(":memory:")
database.run(
  "CREATE TABLE users_32 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, password TEXT, role TEXT DEFAULT 'user')",
)
database.run("CREATE TABLE plain_users_32 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { User, PlainUser },
})

// ─── 1. Set mutator: transforms on write ──────────────────────

console.log("=== 1. Set mutator ===")
const user = User.hydrate({ id: 1, name: "  Alice  ", email: "alice@test.com" })
user.set("name", "  Alice  ")
console.log(`After set("name", "  Alice  "):`)
console.log(`  attributes.name = "${user.attributes.name}"`) // "Alice" (trimmed)
console.log(`  get("name")      = "${user.get("name")}"`) // "ALICE" (uppercased)

// ─── 2. Get accessor: transforms on read ─────────────────────

console.log("\n=== 2. Get accessor ===")
user.set("password", "secret123")
console.log(`After set("password", "secret123"):`)
console.log(`  attributes.password = "${user.attributes.password}"`) // "hash_secret123"
console.log(`  get("password")     = "${user.get("password")}"`) // "***"

// ─── 3. Read-only accessor ───────────────────────────────────

console.log("\n=== 3. Read-only accessor ===")
user.set("email", "ALICE@EXAMPLE.COM")
console.log(`After set("email", "ALICE@EXAMPLE.COM"):`)
console.log(`  attributes.email = "${user.attributes.email}"`) // "ALICE@EXAMPLE.COM" (raw)
console.log(`  get("email")     = "${user.get("email")}"`) // "alice@example.com" (lowercased)

// ─── 4. Write-only mutator ───────────────────────────────────

console.log("\n=== 4. Write-only mutator ===")
user.set("role", "ADMIN")
console.log(`After set("role", "ADMIN"):`)
console.log(`  attributes.role = "${user.attributes.role}"`) // "admin" (lowercased)
console.log(`  get("role")     = "${user.get("role")}"`) // "admin"

// ─── 5. fill() applies set mutators ──────────────────────────

console.log("\n=== 5. fill() applies set mutators ===")
user.fill({
  name: "  Bob  ",
  password: "newpass",
  role: "EDITOR",
})
console.log(`After fill({ name: "  Bob  ", password: "newpass", role: "EDITOR" }):`)
console.log(`  attributes.name     = "${user.attributes.name}"`) // "Bob"
console.log(`  attributes.password = "${user.attributes.password}"`) // "hash_newpass"
console.log(`  attributes.role     = "${user.attributes.role}"`) // "editor"

// ─── 6. Insert applies set mutators (new record) ──────────────

console.log("\n=== 6. Insert applies set mutators ===")
const inserted = await User.insert({
  name: "  Charlie  ",
  email: "CHARLIE@TEST.COM",
  password: "charlie123",
  role: "SUPERADMIN",
})
console.log("After User.insert({ name: '  Charlie  ', password: 'charlie123', ... }):")
console.log(`  attributes.name     = "${inserted.attributes.name}"`) // "Charlie"
console.log(`  attributes.password = "${inserted.attributes.password}"`) // "hash_charlie123"
console.log(`  attributes.role     = "${inserted.attributes.role}"`) // "superadmin"

// ─── 7. get() still applies accessor after insert ────────────

console.log("\n=== 7. get() applies accessor after insert ===")
console.log(`  get("name")     = "${inserted.get("name")}"`) // "CHARLIE"
console.log(`  get("password") = "${inserted.get("password")}"`) // "***"
console.log(`  get("email")    = "${inserted.get("email")}"`) // "charlie@test.com"

// ─── 8. Serialization applies accessors ──────────────────────

console.log("\n=== 8. $toJSON() applies get accessors ===")
const json = inserted.$toJSON()
console.log("JSON output:", JSON.stringify(json, null, 2))
// name is uppercased, password is masked, email is lowercased

// ─── 9. DB read does NOT apply set mutators ──────────────────

console.log("\n=== 9. DB read (hydrate) does not apply set mutators ===")
const fetched = await User.find(inserted.get("id") as number)
console.log("After find from DB:")
console.log(`  attributes.name = "${fetched!.attributes.name}"`) // "Charlie" (already stored trimmed)
console.log(`  get("name")     = "${fetched!.get("name")}"`) // "CHARLIE" (accessor applies)

// ─── 10. Dirty tracking with mutators ────────────────────────

console.log("\n=== 10. Dirty tracking ===")
const clean = User.hydrate({ id: 99, name: "Diana" })
console.log(`Initial isDirty: ${clean.isDirty()}`) // false

clean.set("name", "  Diana  ") // mutator trims to "Diana" — same as original
console.log(`After set to same value: isDirty = ${clean.isDirty()}`) // false

clean.set("name", "  Diana Updated  ") // mutator trims to "Diana Updated"
console.log(`After set to different value: isDirty = ${clean.isDirty()}`) // true
console.log(`  dirtyAttributes.name = "${clean.dirtyAttributes.name}"`) // "Diana Updated"

// ─── 11. Model without attributes (backward compat) ──────────

console.log("\n=== 11. Model without attributes (unchanged) ===")
const plain = await PlainUser.insert({ name: "Plain" })
console.log(`Plain model get("name") = "${plain.get("name")}"`)

await db.destroy()

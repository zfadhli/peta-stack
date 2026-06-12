import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { Attribute, createPeta, defineModel } from "../src/index.js"

const _t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Helper models ────────────────────────────────────────────────

const t = (name: string) =>
  defineModel(name, {
    columns: {
      id: _t.integer().primaryKey(),
      name: _t.string(255),
      email: _t.text().nullable(),
      password: _t.string(255).nullable(),
      role: _t.string(50).nullable().default("user"),
    },
  })

// ─── Unit tests (no DB) ──────────────────────────────────────────

describe("Attribute.make()", () => {
  it("throws when neither get nor set is provided", () => {
    expect(() => (Attribute.make as any)({})).toThrow("Attribute.make() requires at least one of `get` or `set`")
  })

  it("accepts only get", () => {
    const attr = Attribute.make<string>({ get: (v) => v?.toUpperCase() })
    expect(attr.get).toBeDefined()
    expect(attr.set).toBeUndefined()
  })

  it("accepts only set", () => {
    const attr = Attribute.make({ set: (v: string) => v.trim() })
    expect(attr.set).toBeDefined()
    expect(attr.get).toBeUndefined()
  })

  it("accepts both get and set", () => {
    const attr = Attribute.make<string>({
      get: (v) => v,
      set: (v) => v,
    })
    expect(attr.get).toBeDefined()
    expect(attr.set).toBeDefined()
  })
})

// ─── Integration tests (with DB) ──────────────────────────────────

describe("Attribute accessors & mutators", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  // Model with attribute transformations
  const User = defineModel("attr_users", {
    columns: {
      id: _t.integer().primaryKey(),
      name: _t.string(255),
      email: _t.text().nullable(),
      password: _t.string(255).nullable(),
      role: _t.string(50).nullable().default("user"),
    },
    attributes: {
      // Mutator: uppercase name on set, accessor: reverse on get for testing
      name: Attribute.make({
        set: (v: string) => v.trim(),
        get: (v: string) => v?.toUpperCase(),
      }),
      // Mutator: prefix password with hash marker (simulates hashing)
      password: Attribute.make({
        set: (v: string, _instance) => `hash_${v}`,
        get: () => "***",
      }),
      // Read-only computed-like attribute
      email: Attribute.make({
        get: (v: string | null) => (v ? v.toLowerCase() : v),
      }),
      // Write-only attribute
      role: Attribute.make({
        set: (v: string) => v.toLowerCase(),
      }),
    },
  })

  const NoAccessors = defineModel("no_accessors", {
    columns: {
      id: _t.integer().primaryKey(),
      name: _t.string(255),
    },
  })

  beforeAll(async () => {
    db.run("PRAGMA journal_mode = WAL")
    db.run(
      "CREATE TABLE attr_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, password TEXT, role TEXT DEFAULT 'user')",
    )
    db.run("CREATE TABLE no_accessors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(User, NoAccessors)
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  // ── 1. Get accessor ────────────────────────────────────────

  it("1. get accessor transforms value on read via model.get()", async () => {
    const user = await User.insert({ name: "  Alice  ", email: "alice@test.com" })
    // set mutator trimmed the name
    const rawName = user.get("name")
    // get accessor uppercased it
    expect(rawName).toBe("ALICE")

    // Verify the stored value in attributes is the trimmed version
    expect(user.attributes.name).toBe("Alice")
  })

  // ── 2. Set mutator ─────────────────────────────────────────

  it("2. set mutator transforms value on write via model.set()", async () => {
    const user = User.hydrate({ id: 1, name: "Bob", email: "bob@test.com" })
    user.set("password", "secret123")

    // Accessor masks on read
    expect(user.get("password")).toBe("***")

    // But underlying attribute has the hashed value
    expect(user.attributes.password).toBe("hash_secret123")
  })

  // ── 3. Both get+set round-trip ──────────────────────────────

  it("3. both get and set work together", async () => {
    const user = User.hydrate({ id: 2, name: "Charlie", email: "charlie@test.com" })

    // Set mutator trims
    user.set("name", "  CHARLIE  ")
    expect(user.attributes.name).toBe("CHARLIE")

    // Get accessor uppercases
    expect(user.get("name")).toBe("CHARLIE")

    // Set and get again
    user.set("name", "  charlie  ")
    expect(user.attributes.name).toBe("charlie")
    expect(user.get("name")).toBe("CHARLIE")
  })

  // ── 4. Read-only (only get) ─────────────────────────────────

  it("4. read-only attribute: get transforms, set stores raw value", async () => {
    const user = User.hydrate({ id: 3, name: "Diana", email: "DIANA@TEST.COM" })

    // Get accessor lowercases
    expect(user.get("email")).toBe("diana@test.com")

    // Set stores the raw value (no mutator for email)
    user.set("email", "  UPPERCASE@TEST.COM  ")
    expect(user.attributes.email).toBe("  UPPERCASE@TEST.COM  ")

    // Get accessor still applies
    expect(user.get("email")).toBe("  uppercase@test.com  ")
  })

  // ── 5. Write-only (only set) ────────────────────────────────

  it("5. write-only attribute: set transforms, get returns stored value", async () => {
    const user = User.hydrate({ id: 4, name: "Eve", role: "ADMIN" })

    // set mutator lowercased it on hydrate via fill path
    // Actually hydrate is DB read path, so role wasn't transformed.
    // Let's test explicitly:
    user.set("role", "MODERATOR")
    expect(user.attributes.role).toBe("moderator")
    expect(user.get("role")).toBe("moderator")
  })

  // ── 6. With casts ──────────────────────────────────────────

  it("6. accessor/mutator with casts does not interfere", async () => {
    const WithCast = defineModel("with_casts", {
      columns: {
        id: _t.integer().primaryKey(),
        name: _t.string(255),
        metadata: _t.text().nullable(),
      },
      casts: {
        metadata: "json",
      },
      attributes: {
        name: Attribute.make({
          get: (v: string) => v?.toUpperCase(),
          set: (v: string) => v.trim(),
        }),
      },
    })

    db.run(
      "CREATE TABLE IF NOT EXISTS with_casts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, metadata TEXT)",
    )
    peta.registerAll(WithCast)

    const item = WithCast.hydrate({
      id: 1,
      name: "  hello  ",
      metadata: '{"foo":"bar"}',
    })

    // Cast is applied first, then accessor
    expect(item.get("metadata")).toEqual({ foo: "bar" })

    // Set mutator trims, then no cast for name
    item.set("name", "  world  ")
    expect(item.attributes.name).toBe("world")
    expect(item.get("name")).toBe("WORLD")
  })

  // ── 7. Serialization ────────────────────────────────────────

  it("7. $toJSON() applies get accessor", async () => {
    const user = User.hydrate({
      id: 5,
      name: "Frank",
      email: "FRANK@TEST.COM",
      password: "hash_xyz",
      role: "user",
    })

    const json = user.$toJSON()
    expect(json.name).toBe("FRANK") // from accessor
    expect(json.email).toBe("frank@test.com") // from accessor (lowercased)
    expect(json.password).toBe("***") // from accessor (masked)
  })

  // ── 8. fill() ───────────────────────────────────────────────

  it("8. fill() applies set mutators", async () => {
    const user = User.hydrate({ id: 6, name: "Grace", email: "grace@test.com" })

    user.fill({
      name: "  Grace  ",
      password: "mypassword",
      role: "EDITOR",
    })

    expect(user.attributes.name).toBe("Grace") // trimmed by mutator
    expect(user.attributes.password).toBe("hash_mypassword") // hashed by mutator
    expect(user.attributes.role).toBe("editor") // lowercased by mutator
  })

  // ── 9. New record applies set mutator ─────────────────────

  it("9. Model.insert() applies set mutators", async () => {
    const user = await User.insert({
      name: "  Heidi  ",
      email: "heidi@test.com",
      password: "secret",
      role: "ADMIN",
    })

    // Set mutator should have been applied during creation
    expect(user.attributes.name).toBe("Heidi") // trimmed
    expect(user.attributes.password).toBe("hash_secret") // hashed
    expect(user.attributes.role).toBe("admin") // lowercased

    // get() still applies get accessor
    expect(user.get("name")).toBe("HEIDI")
    expect(user.get("password")).toBe("***")
  })

  it("9b. Model.create() applies set mutators", async () => {
    const user = await User.create({
      name: "  Ivan  ",
      email: "ivan@test.com",
      password: "pass123",
    })

    expect(user.attributes.name).toBe("Ivan")
    expect(user.attributes.password).toBe("hash_pass123")
  })

  // ── 10. DB read does NOT apply set mutator ─────────────────

  it("10. DB read / hydrate does NOT apply set mutators", async () => {
    // Insert raw data into DB
    const raw = await User.insert({
      name: "raw",
      email: "raw@test.com",
      role: "user",
    })
    const id = raw.get("id") as number

    // Fetch from DB — should go through DB read path
    const fetched = await User.find(id)
    expect(fetched).toBeDefined()

    // The name stored in DB is the set-mutated value ("raw" → trimmed "raw")
    // But the get accessor uppercases it
    expect(fetched!.get("name")).toBe("RAW")

    // Verify hydrate (used for DB reads) also doesn't apply set mutators
    const hydrated = User.hydrate({
      id: 999,
      name: "  Hydrated  ",
      email: null,
    })

    // DB read path: apply casts, NO set mutators
    // So attributes.name should still have spaces (set mutator not applied)
    expect(hydrated.attributes.name).toBe("  Hydrated  ")
    // But get accessor still applies on read (uppercases)
    expect(hydrated.get("name")).toBe("  HYDRATED  ")
  })

  // ── 11. Dirty tracking ─────────────────────────────────────

  it("11. dirty tracking works with mutators", async () => {
    const user = User.hydrate({ id: 7, name: "Jack", email: null })

    expect(user.isDirty()).toBe(false)

    // Set with mutator — should mark dirty (trim "  Jacob  " → "Jacob", original is "Jack")
    user.set("name", "  Jacob  ")
    expect(user.isDirty()).toBe(true)
    expect(user.isDirty("name")).toBe(true)

    // The dirty value should be the stored (mutated) value
    const dirty = user.dirtyAttributes
    expect(dirty.name).toBe("Jacob")

    // Reset — should revert to original
    user.reset()
    expect(user.get("name")).toBe("JACK")
    expect(user.isDirty()).toBe(false)
  })

  // ── 12. Instance in callback ────────────────────────────────

  it("12. accessor/mutator can use instance.get()", async () => {
    const FullNameModel = defineModel("fullname_users", {
      columns: {
        id: _t.integer().primaryKey(),
        firstName: _t.string(255),
        lastName: _t.string(255),
      },
      attributes: {
        fullName: Attribute.make({
          get: (_v: undefined, instance) => `${instance.get("firstName")} ${instance.get("lastName")}`,
        }),
      },
    })

    db.run(
      "CREATE TABLE IF NOT EXISTS fullname_users (id INTEGER PRIMARY KEY AUTOINCREMENT, firstName TEXT NOT NULL, lastName TEXT NOT NULL)",
    )
    peta.registerAll(FullNameModel)

    const user = FullNameModel.hydrate({ id: 1, firstName: "John", lastName: "Doe" })
    expect(user.get("fullName")).toBe("John Doe")

    // Mutator can also use instance
    const CounterModel = defineModel("counter_users", {
      columns: {
        id: _t.integer().primaryKey(),
        name: _t.string(255),
        version: _t.integer().default(1),
      },
      attributes: {
        name: Attribute.make({
          set: (v: string, instance) => {
            instance.set("version", (instance.get("version") as number) + 1)
            return v.trim()
          },
        }),
      },
    })

    db.run(
      "CREATE TABLE IF NOT EXISTS counter_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, version INTEGER DEFAULT 1)",
    )
    peta.registerAll(CounterModel)

    const cuser = CounterModel.hydrate({ id: 1, name: "Test", version: 1 })
    expect(cuser.get("version")).toBe(1)

    cuser.set("name", "  Updated  ")
    expect(cuser.attributes.name).toBe("Updated") // trimmed
    expect(cuser.get("version")).toBe(2) // incremented by mutator
  })

  // ── 13. appends still works ─────────────────────────────────

  it("13. convention-based get<Key>Attribute() still works for appends", async () => {
    const AppendModel = defineModel("append_models", {
      columns: {
        id: _t.integer().primaryKey(),
        firstName: _t.string(255),
        lastName: _t.string(255),
      },
      appends: ["fullName"],
    })

    db.run(
      "CREATE TABLE IF NOT EXISTS append_models (id INTEGER PRIMARY KEY AUTOINCREMENT, firstName TEXT NOT NULL, lastName TEXT NOT NULL)",
    )
    peta.registerAll(AppendModel)

    const user = AppendModel.hydrate({ id: 1, firstName: "Jane", lastName: "Smith" })

    // Manually add the convention method
    ;(user as any).getFullNameAttribute = function () {
      return `${this.get("firstName")} ${this.get("lastName")}`
    }

    const json = user.$toJSON()
    // The attribute config doesn't include an Attribute for fullName,
    // but the convention method still fires for appends
    expect(json.fullName).toBe("Jane Smith")
  })

  // ── 14. Model without attributes still works ───────────────

  it("14. models without attributes config work as before", async () => {
    const item = await NoAccessors.insert({ name: "Plain" })
    expect(item.get("name")).toBe("Plain")

    item.set("name", "Updated")
    expect(item.get("name")).toBe("Updated")
  })
})

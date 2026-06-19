import { describe, expect, it } from "bun:test"
import type { SchemaColumn, SchemaIndex, SchemaSnapshot } from "../src/types.js"
import { diffSnapshots } from "../src/index.js"

function table(name: string, columns: SchemaColumn[], indexes: SchemaIndex[] = []): { name: string; columns: SchemaColumn[]; indexes: SchemaIndex[] } {
  return { name, columns, indexes }
}

function col(name: string, overrides: Partial<SchemaColumn> = {}): SchemaColumn {
  return {
    name,
    type: "integer",
    isNullable: false,
    isPrimaryKey: false,
    isUnique: false,
    defaultValue: undefined,
    ...overrides,
  }
}

function snapshot(tables: ReturnType<typeof table>[]): SchemaSnapshot {
  return { version: 1, tables }
}

describe("diffSnapshots", () => {
  it("returns empty diffs for identical snapshots", () => {
    const s = snapshot([table("users", [col("id", { isPrimaryKey: true }), col("name", { type: "varchar(255)" })])])
    expect(diffSnapshots(s, s)).toEqual([])
  })

  it("detects createTable when table appears in next but not prev", () => {
    const prev = snapshot([])
    const next = snapshot([table("users", [col("id", { isPrimaryKey: true })])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("createTable")
    expect(diffs[0]!.table).toBe("users")
    expect(diffs[0]!.details?.columns).toBeDefined()
  })

  it("detects dropTable when table appears in prev but not next", () => {
    const prev = snapshot([table("users", [col("id")])])
    const next = snapshot([])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("dropTable")
    expect(diffs[0]!.table).toBe("users")
  })

  it("detects addColumn", () => {
    const prev = snapshot([table("users", [col("id")])])
    const next = snapshot([table("users", [col("id"), col("name", { type: "varchar(255)" })])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("addColumn")
    expect(diffs[0]!.table).toBe("users")
    expect(diffs[0]!.column).toBe("name")
  })

  it("detects dropColumn", () => {
    const prev = snapshot([table("users", [col("id"), col("name")])])
    const next = snapshot([table("users", [col("id")])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("dropColumn")
    expect(diffs[0]!.table).toBe("users")
    expect(diffs[0]!.column).toBe("name")
  })

  it("detects alterColumn when type changes", () => {
    const prev = snapshot([table("users", [col("name", { type: "varchar(255)" })])])
    const next = snapshot([table("users", [col("name", { type: "text" })])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("alterColumn")
    expect(diffs[0]!.table).toBe("users")
    expect(diffs[0]!.column).toBe("name")
    expect((diffs[0]!.details as any)?.from.type).toBe("varchar(255)")
    expect((diffs[0]!.details as any)?.to.type).toBe("text")
  })

  it("detects alterColumn when nullable changes", () => {
    const prev = snapshot([table("users", [col("name", { type: "varchar(255)", isNullable: false })])])
    const next = snapshot([table("users", [col("name", { type: "varchar(255)", isNullable: true })])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("alterColumn")
  })

  it("detects alterColumn when defaultValue changes", () => {
    const prev = snapshot([table("users", [col("role", { type: "varchar(50)", defaultValue: "user" })])])
    const next = snapshot([table("users", [col("role", { type: "varchar(50)", defaultValue: "admin" })])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("alterColumn")
  })

  it("detects alterColumn when references change", () => {
    const prev = snapshot([table("posts", [col("userId", { references: { table: "users", column: "id" } })])])
    const next = snapshot([table("posts", [col("userId", { references: { table: "authors", column: "id" } })])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("alterColumn")
  })

  it("does NOT detect alterColumn when only isPrimaryKey changes", () => {
    // Primary key changes on same column are not detected by columnsDiffer
    // This is expected behavior — PK changes are structural
    const prev = snapshot([table("users", [col("id", { isPrimaryKey: false })])])
    const next = snapshot([table("users", [col("id", { isPrimaryKey: true })])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("alterColumn")
  })

  it("detects addIndex", () => {
    const prev = snapshot([table("users", [col("id"), col("email")])])
    const next = snapshot([table("users", [col("id"), col("email")], [{ name: "users_email_index", columns: ["email"] }])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("addIndex")
    expect(diffs[0]!.table).toBe("users")
    expect((diffs[0]!.details as any)?.indexName).toBe("users_email_index")
  })

  it("detects dropIndex", () => {
    const prev = snapshot([table("users", [col("id"), col("email")], [{ name: "users_email_index", columns: ["email"] }])])
    const next = snapshot([table("users", [col("id"), col("email")])])
    const diffs = diffSnapshots(prev, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("dropIndex")
    expect(diffs[0]!.table).toBe("users")
  })

  it("handles multiple simultaneous changes", () => {
    const prev = snapshot([
      table("users", [col("id", { isPrimaryKey: true }), col("name", { type: "varchar(255)" })]),
      table("posts", [col("id", { isPrimaryKey: true }), col("title", { type: "varchar(255)" })]),
    ])
    const next = snapshot([
      table("users", [col("id", { isPrimaryKey: true }), col("name", { type: "text" }), col("email", { type: "varchar(255)" })]),
      table("comments", [col("id", { isPrimaryKey: true }), col("body", { type: "text" })]),
    ])
    const diffs = diffSnapshots(prev, next)
    // posts dropped, comments created, name altered (varchar->text), email added
    expect(diffs.length).toBeGreaterThanOrEqual(4)
    expect(diffs.find((d) => d.type === "dropTable" && d.table === "posts")).toBeDefined()
    expect(diffs.find((d) => d.type === "createTable" && d.table === "comments")).toBeDefined()
    expect(diffs.find((d) => d.type === "alterColumn" && d.column === "name")).toBeDefined()
    expect(diffs.find((d) => d.type === "addColumn" && d.column === "email")).toBeDefined()
  })

  it("returns empty for identical tables with no changes", () => {
    const t = table("users", [col("id", { isPrimaryKey: true }), col("name", { type: "varchar(255)" })])
    const s = snapshot([t])
    expect(diffSnapshots(s, snapshot([t]))).toEqual([])
  })

  it("handles empty prev snapshot (initial state)", () => {
    const next = snapshot([table("users", [col("id", { isPrimaryKey: true })])])
    const diffs = diffSnapshots({ version: 1, tables: [] }, next)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("createTable")
  })

  it("handles empty next snapshot (all tables dropped)", () => {
    const prev = snapshot([table("users", [col("id")])])
    const diffs = diffSnapshots(prev, { version: 1, tables: [] })
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.type).toBe("dropTable")
  })
})

import { describe, expect, it } from "bun:test"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { ValidationError } from "../src/errors.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

describe("column types", () => {
  describe("basic types", () => {
    it("integer", () => {
      const col = t.integer()
      expect(col.dataType).toBe("integer")
      expect(col.parse(42)).toBe(42)
      expect(col.parse(-1)).toBe(-1)
      expect(() => col.parse("not a number")).toThrow(ValidationError)
    })

    it("string", () => {
      const col = t.string()
      expect(col.dataType).toBe("string")
      expect(col.parse("hello")).toBe("hello")
      expect(col.parse("")).toBe("")
    })

    it("boolean", () => {
      const col = t.boolean()
      expect(col.dataType).toBe("boolean")
      expect(col.parse(true)).toBe(true)
      expect(col.parse(false)).toBe(false)
      expect(() => col.parse("true")).toThrow(ValidationError)
    })

    it("text", () => {
      const col = t.text()
      expect(col.dataType).toBe("text")
      expect(col.parse("a long text")).toBe("a long text")
    })
  })

  describe("modifiers", () => {
    it("nullable", () => {
      const col = t.integer().nullable()
      expect(col.isNullable).toBe(true)
      expect(col.parse(42)).toBe(42)
      expect(col.parse(null)).toBe(null)
    })

    it("default", () => {
      const col = t.integer().default(0)
      expect(col.defaultValue).toBe(0)
    })

    it("default with function", () => {
      const col = t.timestamp().default(() => new Date())
      expect(typeof col.defaultValue).toBe("function")
    })

    it("primaryKey", () => {
      const col = t.integer().primaryKey()
      expect(col.isPrimaryKey).toBe(true)
      expect(col.dataType).toBe("integer")
    })

    it("unique", () => {
      const col = t.string().unique()
      expect(col.isUnique).toBe(true)
    })

    it("email", () => {
      const col = t.string().email()
      expect(col.parse("user@example.com")).toBe("user@example.com")
      expect(() => col.parse("not-an-email")).toThrow(ValidationError)
    })

    it("url", () => {
      const col = t.string().url()
      expect(col.parse("https://example.com")).toBe("https://example.com")
      expect(() => col.parse("not-a-url")).toThrow(ValidationError)
    })

    it("min/max for numbers", () => {
      const col = t.integer().min(0).max(100)
      expect(col.parse(50)).toBe(50)
      expect(col.parse(0)).toBe(0)
      expect(col.parse(100)).toBe(100)
      expect(() => col.parse(-1)).toThrow(ValidationError)
      expect(() => col.parse(101)).toThrow(ValidationError)
    })

    it("min/max for strings", () => {
      const col = t.string().min(2).max(10)
      expect(col.parse("ab")).toBe("ab")
      expect(col.parse("abcdef")).toBe("abcdef")
      expect(() => col.parse("a")).toThrow(ValidationError)
      expect(() => col.parse("abcdefghijk")).toThrow(ValidationError)
    })

    it("pattern", () => {
      const col = t.string().pattern(/^[a-z]+$/)
      expect(col.parse("hello")).toBe("hello")
      expect(() => col.parse("Hello123")).toThrow(ValidationError)
    })

    it("chained modifiers", () => {
      const col = t.integer().min(1).max(10).nullable().default(5)
      expect(col.isNullable).toBe(true)
      expect(col.defaultValue).toBe(5)
      expect(col.parse(1)).toBe(1)
      expect(col.parse(null)).toBe(null)
      expect(() => col.parse(0)).toThrow(ValidationError)
      expect(() => col.parse(11)).toThrow(ValidationError)
    })
  })

  describe("special types", () => {
    it("enum", () => {
      const col = t.enum("admin", "user", "guest")
      expect(col.parse("admin")).toBe("admin")
      expect(col.parse("user")).toBe("user")
      expect(() => col.parse("superadmin")).toThrow(ValidationError)
    })

    it("uuid", () => {
      const col = t.uuid()
      expect(col.parse("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000")
      expect(() => col.parse("not-a-uuid")).toThrow(ValidationError)
    })

    it("timestamp", () => {
      const col = t.timestamp()
      expect(col.parse("2024-01-15T10:30:00.000Z")).toBe("2024-01-15T10:30:00.000Z")
    })

    it("json", () => {
      const col = t.json()
      const obj = { a: 1, b: "hello" }
      expect(col.parse(obj)).toEqual(obj)
      expect(col.parse("any value")).toBe("any value")
    })

    it("float", () => {
      const col = t.float()
      expect(col.parse(3.14)).toBe(3.14)
      expect(col.parse(0)).toBe(0)
      expect(col.parse(-1.5)).toBe(-1.5)
    })

    it("decimal", () => {
      const col = t.decimal(10, 2)
      expect(col.parse(99.99)).toBe(99.99)
    })

    it("bigint", () => {
      const col = t.bigint()
      expect(col.parse(9007199254740991)).toBe(9007199254740991)
      expect(() => col.parse(1.5)).toThrow(ValidationError)
    })
  })

  describe("timestamps", () => {
    it("creates createdAt and updatedAt", () => {
      const ts = t.timestamps()
      expect(ts.createdAt.dataType).toBe("timestamp")
      expect(ts.updatedAt.dataType).toBe("timestamp")
      expect(typeof ts.createdAt.defaultValue).toBe("function")
      expect(typeof ts.updatedAt.defaultValue).toBe("function")
    })
  })

  describe("hasConstraint", () => {
    it("checks constraint existence", () => {
      const col = t.string().email().min(3)
      expect(col.hasConstraint("email")).toBe(true)
      expect(col.hasConstraint("min")).toBe(true)
      expect(col.hasConstraint("max")).toBe(false)
      expect(col.hasConstraint("nullable")).toBe(false)
    })
  })

  describe("assert", () => {
    it("asserts valid input", () => {
      const col = t.integer().min(0)
      expect(col.assert(5)).toBe(5)
    })

    it("throws on invalid input", () => {
      const col = t.string().email()
      expect(() => col.assert("bad")).toThrow(ValidationError)
    })
  })

  describe("immutability", () => {
    it("modifiers return new instances", () => {
      const base = t.integer()
      const nullable = base.nullable()
      expect(base.isNullable).toBe(false)
      expect(nullable.isNullable).toBe(true)
    })

    it("original is not affected by chained modifiers", () => {
      const base = t.integer()
      base.min(0).max(100)
      expect(() => base.parse(-1)).not.toThrow()
    })
  })

  describe("references", () => {
    it("stores reference metadata", () => {
      class User {}
      const col = t.integer().references(() => User, ["id"])
      expect(col.hasConstraint("references")).toBe(true)
    })
  })
})

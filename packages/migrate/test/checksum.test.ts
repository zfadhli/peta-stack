import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { computeChecksum, loadChecksums, saveChecksums, verifyChecksum } from "../src/index.js"

const tmpDir = resolve(import.meta.dirname, "../../.tmp/checksum-test")
const storePath = resolve(tmpDir, ".checksums.json")

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true })
})

afterAll(() => {
  // Cleanup all files in tmpDir
  try {
    if (existsSync(storePath)) unlinkSync(storePath)
    if (existsSync(resolve(tmpDir, "001_test.ts"))) unlinkSync(resolve(tmpDir, "001_test.ts"))
    if (existsSync(resolve(tmpDir, "002_other.ts"))) unlinkSync(resolve(tmpDir, "002_other.ts"))
  } catch {}
})

describe("checksum", () => {
  it("computeChecksum returns a 64-char hex string", () => {
    const filePath = resolve(tmpDir, "001_test.ts")
    writeFileSync(filePath, "export async function up() {}", "utf-8")

    const hash = computeChecksum(filePath)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    unlinkSync(filePath)
  })

  it("computeChecksum is deterministic for same content", () => {
    const filePath = resolve(tmpDir, "001_test.ts")
    writeFileSync(filePath, "const x = 1", "utf-8")

    const h1 = computeChecksum(filePath)
    const h2 = computeChecksum(filePath)
    expect(h1).toBe(h2)
    unlinkSync(filePath)
  })

  it("computeChecksum differs for different content", () => {
    const f1 = resolve(tmpDir, "001_test.ts")
    const f2 = resolve(tmpDir, "002_other.ts")
    writeFileSync(f1, "content a", "utf-8")
    writeFileSync(f2, "content b", "utf-8")

    const h1 = computeChecksum(f1)
    const h2 = computeChecksum(f2)
    expect(h1).not.toBe(h2)
    unlinkSync(f1)
    unlinkSync(f2)
  })

  it("saveChecksums writes a valid JSON file", () => {
    saveChecksums(tmpDir, { "001_test": "abc123" })

    const content = readFileSync(storePath, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed).toEqual({ "001_test": "abc123" })
  })

  it("loadChecksums reads saved checksums", () => {
    saveChecksums(tmpDir, { "001_test": "abc123", "002_migrate": "def456" })

    const loaded = loadChecksums(tmpDir)
    expect(loaded["001_test"]).toBe("abc123")
    expect(loaded["002_migrate"]).toBe("def456")
  })

  it("loadChecksums returns empty object for missing file", () => {
    const emptyDir = resolve(tmpDir, "empty")
    mkdirSync(emptyDir, { recursive: true })

    const loaded = loadChecksums(emptyDir)
    expect(loaded).toEqual({})
  })

  it("loadChecksums returns empty object for corrupt JSON", () => {
    writeFileSync(storePath, "not-json{", "utf-8")
    const loaded = loadChecksums(tmpDir)
    expect(loaded).toEqual({})
  })

  it("verifyChecksum returns true when no stored checksum exists", () => {
    const emptyDir = resolve(tmpDir, "noverify")
    mkdirSync(emptyDir, { recursive: true })

    const result = verifyChecksum(emptyDir, "001_new.ts", "/tmp/nonexistent.ts")
    expect(result).toBe(true)
  })

  it("verifyChecksum returns true when checksum matches", () => {
    const filePath = resolve(tmpDir, "001_match.ts")
    writeFileSync(filePath, "matching content", "utf-8")

    const hash = computeChecksum(filePath)
    saveChecksums(tmpDir, { "001_match": hash })

    const result = verifyChecksum(tmpDir, "001_match", filePath)
    expect(result).toBe(true)
    unlinkSync(filePath)
  })

  it("verifyChecksum returns false when checksum differs", () => {
    const filePath = resolve(tmpDir, "001_diff.ts")
    writeFileSync(filePath, "original content", "utf-8")

    // Store a different hash
    saveChecksums(tmpDir, { "001_diff": "0000000000000000000000000000000000000000000000000000000000000000" })

    const result = verifyChecksum(tmpDir, "001_diff", filePath)
    expect(result).toBe(false)
    unlinkSync(filePath)
  })

  it("round-trips: save → load → verify", () => {
    const filePath = resolve(tmpDir, "001_roundtrip.ts")
    writeFileSync(filePath, "round trip content", "utf-8")

    const hash = computeChecksum(filePath)
    saveChecksums(tmpDir, { "001_roundtrip": hash })

    const loaded = loadChecksums(tmpDir)
    expect(loaded["001_roundtrip"]).toBe(hash)

    const verified = verifyChecksum(tmpDir, "001_roundtrip", filePath)
    expect(verified).toBe(true)

    unlinkSync(filePath)
  })
})

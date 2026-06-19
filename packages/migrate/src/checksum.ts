import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

export interface ChecksumStore {
  [name: string]: string
}

/**
 * Compute SHA-256 hex digest of a file's content.
 */
export function computeChecksum(filePath: string): string {
  const content = readFileSync(filePath, "utf-8")
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Load the checksum store from the migrations directory.
 */
export function loadChecksums(migrationsDir: string): ChecksumStore {
  const filePath = resolve(migrationsDir, ".checksums.json")
  if (!existsSync(filePath)) return {}
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as ChecksumStore
  } catch {
    return {}
  }
}

/**
 * Save checksums to the migrations directory.
 */
export function saveChecksums(migrationsDir: string, store: ChecksumStore): void {
  const filePath = resolve(migrationsDir, ".checksums.json")
  writeFileSync(filePath, JSON.stringify(store, null, 2))
}

/**
 * Verify a migration file's checksum against the stored value.
 * Returns true if match or no stored checksum exists.
 */
export function verifyChecksum(migrationsDir: string, name: string, filePath: string): boolean {
  const store = loadChecksums(migrationsDir)
  const stored = store[name]
  if (!stored) return true // no checksum yet – new migration
  const current = computeChecksum(filePath)
  return stored === current
}

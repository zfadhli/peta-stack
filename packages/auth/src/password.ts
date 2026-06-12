import { hash, verify } from "@node-rs/argon2"

interface HashOptions {
  /** Memory cost in KiB (default: 19456 = 19 MiB). */
  memoryCost?: number
  /** Time cost (iterations) (default: 2). */
  timeCost?: number
  /** Parallelism (default: 1). */
  parallelism?: number
}

// OWASP recommended argon2id parameters
const ARGON2_MEMORY_COST = 19456
const ARGON2_TIME_COST = 2
const ARGON2_PARALLELISM = 1

/**
 * Hash a password with argon2id.
 *
 * @example
 * ```ts
 * const hash = await hashPassword("my-password")
 * ```
 */
export async function hashPassword(password: string, options: HashOptions = {}): Promise<string> {
  return hash(password, {
    algorithm: 2, // Argon2id
    memoryCost: options.memoryCost ?? ARGON2_MEMORY_COST,
    timeCost: options.timeCost ?? ARGON2_TIME_COST,
    parallelism: options.parallelism ?? ARGON2_PARALLELISM,
  })
}

/**
 * Verify a password against an argon2id hash.
 *
 * @example
 * ```ts
 * const ok = await verifyPassword(hash, "my-password")
 * ```
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await verify(hash, password)
  } catch {
    return false
  }
}

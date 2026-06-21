import { defaults as ironDefaults, seal as ironSeal, unseal as ironUnseal } from "iron-webcrypto"
import { PetaAuthError } from "./errors.js"

/** A password that can be a plain string or a versioned map. */
export type Password = string | Record<string, string>

type PasswordsMap = Record<string, string>

const SEVEN_DAYS = 14 * 24 * 3600

export function normalizePassword(password: Password): PasswordsMap {
  return typeof password === "string" ? { 1: password } : password
}

/**
 * Seal arbitrary data with a password (uses iron-webcrypto).
 *
 * @example
 * ```ts
 * const sealed = await sealData({ userId: 1 }, { password: "my-secret-key" })
 * ```
 */
export async function sealData(
  data: unknown,
  { password, ttl = SEVEN_DAYS }: { password: Password; ttl?: number },
): Promise<string> {
  const map = normalizePassword(password)
  const id = Math.max(...Object.keys(map).map(Number)).toString()
  const secret = map[id]!
  if (secret.length < 32) {
    throw new PetaAuthError(
      "PASSWORD_TOO_SHORT",
      "peta-auth: password must be at least 32 characters",
    )
  }

  const seal = await ironSeal(
    data,
    { id, secret },
    {
      ...ironDefaults,
      ttl: ttl * 1000,
      encode: JSON.stringify,
      decode: JSON.parse,
    },
  )

  return seal
}

/**
 * Unseal data previously sealed with {@link sealData}.
 *
 * @example
 * ```ts
 * const data = await unsealData<{ userId: number }>(sealed, { password: "my-secret-key" })
 * ```
 */
export async function unsealData<T>(
  seal: string,
  { password, ttl = SEVEN_DAYS }: { password: Password; ttl?: number },
): Promise<T> {
  const map = normalizePassword(password)

  try {
    const data = (await ironUnseal(seal, map, {
      ...ironDefaults,
      ttl: ttl * 1000,
      encode: JSON.stringify,
      decode: JSON.parse,
    })) as Record<string, unknown> | undefined

    return data as T
  } catch (err) {
    if (
      err instanceof Error &&
      /^(Expired seal|Bad hmac value|Cannot find password|Incorrect number of sealed components)/.test(
        err.message,
      )
    ) {
      return {} as T
    }
    throw err
  }
}

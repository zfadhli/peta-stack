import { defaults as ironDefaults, seal as ironSeal, unseal as ironUnseal } from "iron-webcrypto"

/** A password that can be a plain string or a versioned map. */
export type Password = string | Record<string, string>

type PasswordsMap = Record<string, string>

const SEVEN_DAYS = 14 * 24 * 3600
const CURRENT_MAJOR_VERSION = 2
const VERSION_DELIMITER = "~"

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

  return `${seal}${VERSION_DELIMITER}${CURRENT_MAJOR_VERSION}`
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

  const index = seal.lastIndexOf(VERSION_DELIMITER)
  const sealWithoutVersion = index === -1 ? seal : seal.slice(0, index)
  const tokenVersion = index === -1 ? null : parseInt(seal.slice(index + 1), 10) || null

  try {
    const data = (await ironUnseal(sealWithoutVersion, map, {
      ...ironDefaults,
      ttl: ttl * 1000,
      encode: JSON.stringify,
      decode: JSON.parse,
    })) as Record<string, unknown> | undefined

    if (tokenVersion === 2) return data as T

    return {
      ...(data?.persistent ? { ...(data.persistent as Record<string, unknown>) } : {}),
    } as T
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

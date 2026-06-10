import { defaults as ironDefaults, seal as ironSeal, unseal as ironUnseal } from "iron-webcrypto"

/**
 * Minimal Web Crypto subset needed for iron-webcrypto.
 * @internal
 */
interface PetaCrypto {
  readonly subtle: {
    decrypt: (
      algorithm: AesCbcParams | AesCtrParams | AesGcmParams | AlgorithmIdentifier | RsaOaepParams,
      key: CryptoKey,
      data: Uint8Array,
    ) => Promise<ArrayBuffer>
    deriveBits: (
      algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params,
      baseKey: CryptoKey,
      length: number,
    ) => Promise<ArrayBuffer>
    encrypt: (
      algorithm: AesCbcParams | AesCtrParams | AesGcmParams | AlgorithmIdentifier | RsaOaepParams,
      key: CryptoKey,
      data: Uint8Array,
    ) => Promise<ArrayBuffer>
    importKey: (
      format: Exclude<KeyFormat, "jwk">,
      keyData: ArrayBuffer | Uint8Array,
      algorithm: AesKeyAlgorithm | AlgorithmIdentifier | EcKeyImportParams | HmacImportParams | RsaHashedImportParams,
      extractable: boolean,
      keyUsages: KeyUsage[],
    ) => Promise<CryptoKey>
    sign: (
      algorithm: AlgorithmIdentifier | EcdsaParams | RsaPssParams,
      key: CryptoKey,
      data: Uint8Array,
    ) => Promise<ArrayBuffer>
  }
  getRandomValues: (array: Uint8Array) => Uint8Array
}

/** A password that can be a plain string or a versioned map. */
export type Password = string | Record<string, string>

type PasswordsMap = Record<string, string>

const SEVEN_DAYS = 14 * 24 * 3600
const CURRENT_MAJOR_VERSION = 2
const VERSION_DELIMITER = "~"

function normalizePassword(password: Password): PasswordsMap {
  return typeof password === "string" ? { 1: password } : password
}

function parseSeal(seal: string) {
  const index = seal.lastIndexOf(VERSION_DELIMITER)
  if (index === -1) return { sealWithoutVersion: seal, tokenVersion: null }
  return {
    sealWithoutVersion: seal.slice(0, index),
    tokenVersion: parseInt(seal.slice(index + 1), 10) || null,
  }
}

function getCrypto(): PetaCrypto {
  return globalThis.crypto as unknown as PetaCrypto
}

/**
 * Create a `sealData` function bound to a Web Crypto instance.
 *
 * @internal
 */
export function createSealData(webcrypto: PetaCrypto) {
  return async function sealData(
    data: unknown,
    { password, ttl = SEVEN_DAYS }: { password: Password; ttl?: number },
  ): Promise<string> {
    const map = normalizePassword(password)
    const id = Math.max(...Object.keys(map).map(Number)).toString()
    const secret = map[id]!

    const seal = await ironSeal(
      webcrypto,
      data,
      { id, secret },
      {
        ...ironDefaults,
        ttl: ttl * 1000,
      },
    )

    return `${seal}${VERSION_DELIMITER}${CURRENT_MAJOR_VERSION}`
  }
}

/**
 * Create an `unsealData` function bound to a Web Crypto instance.
 *
 * @internal
 */
export function createUnsealData(webcrypto: PetaCrypto) {
  return async function unsealData<T>(
    seal: string,
    { password, ttl = SEVEN_DAYS }: { password: Password; ttl?: number },
  ): Promise<T> {
    const map = normalizePassword(password)
    const { sealWithoutVersion, tokenVersion } = parseSeal(seal)

    try {
      const data = (await ironUnseal(webcrypto, sealWithoutVersion, map, {
        ...ironDefaults,
        ttl: ttl * 1000,
      })) as Record<string, unknown> | undefined

      if (tokenVersion === 2) return data as T

      return {
        ...(data?.persistent ? { ...(data.persistent as Record<string, unknown>) } : {}),
      } as T
    } catch (err) {
      if (
        err instanceof Error &&
        /^(Expired seal|Bad hmac value|Cannot find password|Incorrect number of sealed components)/.test(err.message)
      ) {
        return {} as T
      }
      throw err
    }
  }
}

/**
 * Seal arbitrary data with a password (uses iron-webcrypto).
 *
 * @example
 * ```ts
 * const sealed = await sealData({ userId: 1 }, { password: "my-secret-key" })
 * ```
 */
export const sealData = createSealData(getCrypto())

/**
 * Unseal data previously sealed with {@link sealData}.
 *
 * @example
 * ```ts
 * const data = await unsealData<{ userId: number }>(sealed, { password: "my-secret-key" })
 * ```
 */
export const unsealData = createUnsealData(getCrypto())

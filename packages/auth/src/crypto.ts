import { defaults as ironDefaults, seal as ironSeal, unseal as ironUnseal } from "iron-webcrypto"

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

type PasswordsMap = Record<string, string>
export type Password = PasswordsMap | string

const fourteenDays = 14 * 24 * 3600
const currentMajorVersion = 2
const versionDelimiter = "~"

function normalizePassword(password: Password): PasswordsMap {
  return typeof password === "string" ? { 1: password } : password
}

function parseSeal(seal: string) {
  const idx = seal.lastIndexOf(versionDelimiter)
  if (idx === -1) return { sealWithoutVersion: seal, tokenVersion: null }
  return {
    sealWithoutVersion: seal.slice(0, idx),
    tokenVersion: parseInt(seal.slice(idx + 1), 10) || null,
  }
}

export function createSealData(webcrypto: PetaCrypto) {
  return async function sealData(
    data: unknown,
    { password, ttl = fourteenDays }: { password: Password; ttl?: number },
  ): Promise<string> {
    const map = normalizePassword(password)
    const id = Math.max(...Object.keys(map).map(Number)).toString()
    const pw = map[id] as string

    const seal = await ironSeal(
      webcrypto,
      data,
      { id, secret: pw },
      {
        ...ironDefaults,
        ttl: ttl * 1000,
      },
    )

    return `${seal}${versionDelimiter}${currentMajorVersion}`
  }
}

export function createUnsealData(webcrypto: PetaCrypto) {
  return async function unsealData<T>(
    seal: string,
    { password, ttl = fourteenDays }: { password: Password; ttl?: number },
  ): Promise<T> {
    const map = normalizePassword(password)
    const { sealWithoutVersion, tokenVersion } = parseSeal(seal)

    try {
      const data =
        (await ironUnseal(webcrypto, sealWithoutVersion, map, {
          ...ironDefaults,
          ttl: ttl * 1000,
        })) ?? {}

      if (tokenVersion === 2) return data as T

      const d = data as Record<string, unknown>
      return { ...(d.persistent ? (d.persistent as Record<string, unknown>) : {}) } as T
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

function getCrypto(): PetaCrypto {
  return globalThis.crypto as unknown as PetaCrypto
}

export const sealData = createSealData(getCrypto())
export const unsealData = createUnsealData(getCrypto())

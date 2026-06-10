/**
 * Typed error for peta-auth.
 *
 * Carries a machine-readable `code` and a human-readable `message`.
 * Thrown instead of raw `new Error(...)` throughout the library.
 */
export class PetaAuthError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "PetaAuthError"
    this.code = code
  }
}

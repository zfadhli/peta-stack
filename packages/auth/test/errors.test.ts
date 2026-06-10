import { describe, expect, it } from "bun:test"
import { PetaAuthError } from "../src/errors.js"

describe("PetaAuthError", () => {
  it("carries code and message", () => {
    const err = new PetaAuthError("TEST_CODE", "something went wrong")
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe("PetaAuthError")
    expect(err.code).toBe("TEST_CODE")
    expect(err.message).toBe("something went wrong")
  })
})

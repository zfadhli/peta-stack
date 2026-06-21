import { describe, expect, it } from "bun:test"
import { type Diagnostic, emitDiagnostic, setOnDiagnostic } from "../src/index.ts"

describe("diagnostics", () => {
  it("calls custom handler when set", () => {
    const received: Diagnostic[] = []
    setOnDiagnostic((d) => received.push(d))

    emitDiagnostic({ level: "warn", message: "test", code: "TEST" })

    expect(received).toHaveLength(1)
    expect(received[0]!.message).toBe("test")
    expect(received[0]!.code).toBe("TEST")

    setOnDiagnostic(null)
  })

  it("defaults to console.warn when no handler", () => {
    // Just verify it doesn't throw
    emitDiagnostic({ level: "warn", message: "test", code: "TEST" })
  })
})

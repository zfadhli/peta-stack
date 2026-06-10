import { describe, expect, it } from "bun:test"
import { sealData, unsealData } from "../src/index.ts"

const password = { 1: "a".repeat(32) }

describe("sealData / unsealData", () => {
  it("roundtrips data", async () => {
    const seal = await sealData({ user: { name: "Jason" } }, { password })
    const data = await unsealData<{ user: { name: string } }>(seal, { password })
    expect(data.user.name).toBe("Jason")
  })

  it("handles password rotation", async () => {
    const passwords = { 1: "x".repeat(32), 2: "y".repeat(32) }
    const seal = await sealData({ msg: "hello" }, { password: passwords })
    const data = await unsealData<{ msg: string }>(seal, { password: passwords })
    expect(data.msg).toBe("hello")
  })

  it("returns empty object for wrong password", async () => {
    const seal = await sealData({ x: 1 }, { password: "a".repeat(32) })
    const data = await unsealData<{ x?: number }>(seal, { password: "b".repeat(32) })
    expect(data.x).toBeUndefined()
  })

  it("rejects password shorter than 32 chars", async () => {
    expect(sealData({ x: 1 }, { password: "short" })).rejects.toThrow("Password string too short")
  })
})

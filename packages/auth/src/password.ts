import { compareSync, genSaltSync, hashSync } from "bcryptjs"

interface HashOptions {
  cost?: number
}

export async function hashPassword(password: string, options: HashOptions = {}): Promise<string> {
  const cost = options.cost ?? 10
  return hashSync(password, genSaltSync(cost))
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return compareSync(password, hash)
}

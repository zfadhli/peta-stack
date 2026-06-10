import { signJWT, verifyJWT } from "../src/jwt.js"

const password = { 1: "demo-secret-key-at-least-32-chars!!" }

const token = await signJWT({ userId: 42, role: "admin" }, { password })
console.log("Signed JWT:", token)

const payload = await verifyJWT<{ userId: number; role: string }>(token, { password })
console.log("Verified payload:", payload)

const fake = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjoiZmFrZSJ9.invalid-signature"
const result = await verifyJWT(fake, { password })
console.log("Tampered token:", result)

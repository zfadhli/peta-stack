import { defineConfig } from "tsdown"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/hono.ts",
    "src/elysia.ts",
    "src/nuxt.ts",
    "src/jwt.ts",
    "src/csrf.ts",
    "src/oauth/github.ts",
    "src/oauth/google.ts",
  ],
  format: "esm",
  dts: true,
  clean: true,
  platform: "node",
  deps: {
    neverBundle: ["bcryptjs", "cookie", "iron-webcrypto", "jose", "elysia", "h3", "hono"],
  },
})

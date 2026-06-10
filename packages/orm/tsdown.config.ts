import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/migrations/index.ts", "src/migrations/cli.ts"],
  format: "esm",
  target: "esnext",
  dts: true,
  clean: true,
  platform: "node",
  deps: {
    neverBundle: ["arktype", "cac", "kysely", "ora"],
  },
})

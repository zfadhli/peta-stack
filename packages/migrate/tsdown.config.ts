import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: "esm",
  target: "esnext",
  dts: true,
  clean: true,
  platform: "node",
  deps: {
    neverBundle: ["cac", "kysely", "ora"],
  },
})

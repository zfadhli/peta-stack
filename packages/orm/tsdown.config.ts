import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "esnext",
  dts: true,
  clean: true,
  platform: "node",
  deps: {
    neverBundle: ["arktype", "kysely"],
  },
})

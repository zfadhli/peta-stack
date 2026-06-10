import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["./src/index.ts", "./src/hono/index.ts"],
  format: "esm",
  target: "esnext",
  dts: true,
  clean: true,
  deps: {
    neverBundle: ["hono", "hono/validator"],
  },
})

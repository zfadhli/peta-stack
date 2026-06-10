// peta.config.ts — Configuration for the Peta CLI migration tools

import { defineConfig } from "peta-orm/migrator"

// Option A: explicit model array (no discovery overhead)
// import { User, Post, Comment, Tag } from "./src/models"
// export default defineConfig({
//   migrationsDir: "./migrations",
//   models: [User, Post, Comment, Tag],
// })

// Option B: glob pattern (auto-discovers Model subclasses)
export default defineConfig({
  migrationsDir: "./migrations",
  models: "./src/models/**/*.ts",
})

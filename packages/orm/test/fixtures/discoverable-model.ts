import { t as columnTypes, createArkTypeSchemaConfig } from "../../src/columns/index.js"
import { defineModel } from "../../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

export const Discovered = defineModel("discovered", {
  columns: {
    id: t.integer().primaryKey(),
    label: t.string(255),
  },
})

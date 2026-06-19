import { t } from "../../src/columns/index.js"
import { defineModel } from "../../src/index.js"


export const Discovered = defineModel("discovered", {
  columns: {
    id: t.integer().primaryKey(),
    label: t.string(255),
  },
})

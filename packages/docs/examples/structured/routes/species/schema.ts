import { type } from "arktype"

export const Species = type({
  id: "number",
  name: "string>0",
})

export const CreateSpecies = type({
  name: "string>0",
})

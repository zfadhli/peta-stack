import { type } from "arktype"

export const Pet = type({
  id: "number",
  name: "string>0",
  species: "string>0",
})

export const CreatePet = type({
  name: "string>0",
  species: "string>0",
})

export const UpdatePet = type({
  name: "string>0 | undefined",
  species: "string>0 | undefined",
})

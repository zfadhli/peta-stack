import { type } from "arktype"
import { Hono } from "hono"
import { route } from "../src/hono/index.ts"
import { getOpenAPISpec, serveScalarUI } from "../src/index.ts"

const app = new Hono()

const Pet = type({
  id: "number",
  name: "string>0",
  species: "'cat'|'dog'|'bird'",
})
const CreatePet = type({ name: "string>0", species: "'cat'|'dog'|'bird'" })
const UpdatePet = type({
  name: "string>0 | undefined",
  species: "'cat'|'dog'|'bird' | undefined",
})

let nextId = 4
const pets = [
  { id: 1, name: "Fido", species: "dog" as const },
  { id: 2, name: "Whiskers", species: "cat" as const },
  { id: 3, name: "Tweety", species: "bird" as const },
]

app.get(
  "/pets",
  route()
    .summary("List all pets")
    .filter("species", type("'cat'|'dog'|'bird'"))
    .sort(["name"])
    .paginated({ maxLimit: 50 })
    .response(200, Pet.array())
    .handle((c) => {
      const q = c.req.valid("query")
      let filtered = [...pets]
      if (q.species) filtered = filtered.filter((p) => p.species === q.species)
      return c.json(filtered.slice(q.offset, q.offset + q.limit))
    }),
)

app.post(
  "/pets",
  route()
    .summary("Create a pet")
    .requestBody(CreatePet)
    .response(201, Pet)
    .response(400, "Invalid input")
    .handle((c) => {
      const body = c.req.valid("json")
      const pet = { id: nextId++, name: body.name, species: body.species }
      pets.push(pet as (typeof pets)[number])
      return c.json(pet, 201)
    }),
)

app.get(
  "/pets/:id",
  route()
    .summary("Get a pet by ID")
    .params(type({ id: "string" }))
    .response(200, Pet)
    .response(404, "Not found")
    .handle((c) => {
      const pet = pets.find((p) => p.id === Number(c.req.param("id")))
      return pet ? c.json(pet) : c.json({ error: "not found" }, 404)
    }),
)

app.patch(
  "/pets/:id",
  route()
    .summary("Update a pet")
    .params(type({ id: "string" }))
    .requestBody(UpdatePet)
    .response(200, Pet)
    .response(404, "Not found")
    .handle((c) => {
      const pet = pets.find((p) => p.id === Number(c.req.param("id")))
      if (!pet) return c.json({ error: "not found" }, 404)
      const body = c.req.valid("json")
      if (body?.name) pet.name = body.name
      if (body?.species) pet.species = body.species
      return c.json(pet)
    }),
)

app.delete(
  "/pets/:id",
  route()
    .summary("Delete a pet")
    .params(type({ id: "string" }))
    .response(204, "Deleted")
    .response(404, "Not found")
    .handle((c) => {
      const idx = pets.findIndex((p) => p.id === Number(c.req.param("id")))
      if (idx === -1) return c.json({ error: "not found" }, 404)
      pets.splice(idx, 1)
      return c.newResponse(null, 204)
    }),
)

const info = {
  title: "Pet Store API",
  version: "1.0.0",
  description: "A sample pet store API.",
}

app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, info)))
app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Pet Store API" }))

const port = Number(process.env.PORT) || 3099
console.log(`Listening on http://localhost:${port}\nDocs at http://localhost:${port}/docs`)
Bun.serve({ fetch: app.fetch, port })

import { type } from "arktype"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { route } from "../src/hono/index.ts"
import { getOpenAPISpec, serveScalarUI } from "../src/index.ts"

const app = new Hono()

app.use("*", cors())
app.use("*", logger())

const Todo = type({
  id: "number",
  title: "string>0",
  completed: "boolean",
  createdAt: "string",
})
const CreateTodo = type({ title: "string>0" })
const UpdateTodo = type({
  title: "string>0 | undefined",
  completed: "boolean | undefined",
  id: "never",
  createdAt: "never",
})
const ErrorResponse = type({ error: "string" })

let nextId = 1
const todos: Array<{
  id: number
  title: string
  completed: boolean
  createdAt: string
}> = []

app.post(
  "/todos",
  route()
    .summary("Create a todo")
    .requestBody(CreateTodo)
    .response(201, Todo)
    .response(400, ErrorResponse)
    .handle((c) => {
      const body = c.req.valid("json")
      const todo = {
        id: nextId++,
        title: body.title.trim(),
        completed: false,
        createdAt: new Date().toISOString(),
      }
      todos.push(todo)
      return c.json(todo, 201)
    }),
)

app.get(
  "/todos",
  route()
    .summary("List todos")
    .filter("completed", type("boolean | undefined"))
    .sort(["id", "title", "createdAt"])
    .paginated()
    .response(200, type({ items: Todo }))
    .handle((c) => {
      const q = c.req.valid("query")
      let filtered = [...todos]
      if (q.completed === true) filtered = filtered.filter((t) => t.completed)
      if (q.completed === false) filtered = filtered.filter((t) => !t.completed)
      filtered.sort((a, b) => b.id - a.id)
      return c.json(filtered.slice(q.offset, q.offset + q.limit))
    }),
)

app.get(
  "/todos/:id",
  route()
    .summary("Get a todo by ID")
    .params(type({ id: "string" }))
    .response(200, Todo)
    .response(404, ErrorResponse)
    .handle((c) => {
      const todo = todos.find((t) => t.id === Number(c.req.param("id")))
      return todo ? c.json(todo) : c.json({ error: "not found" }, 404)
    }),
)

app.patch(
  "/todos/:id",
  route()
    .summary("Update a todo")
    .params(type({ id: "string" }))
    .requestBody(UpdateTodo)
    .response(200, Todo)
    .response(404, ErrorResponse)
    .handle((c) => {
      const todo = todos.find((t) => t.id === Number(c.req.param("id")))
      if (!todo) return c.json({ error: "not found" }, 404)
      const body = c.req.valid("json")
      if (body?.title?.trim()) todo.title = body.title.trim()
      if (body?.completed !== undefined) todo.completed = body.completed
      return c.json(todo)
    }),
)

app.delete(
  "/todos/:id",
  route()
    .summary("Delete a todo")
    .params(type({ id: "string" }))
    .response(204, "Deleted")
    .response(404, ErrorResponse)
    .handle((c) => {
      const idx = todos.findIndex((t) => t.id === Number(c.req.param("id")))
      if (idx === -1) return c.json({ error: "not found" }, 404)
      todos.splice(idx, 1)
      return c.newResponse(null, 204)
    }),
)

app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }))

const info = {
  title: "Todo API",
  version: "2.0.0",
  description: "A full-featured Todo API.",
}

app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, info)))
app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Todo API Docs" }))

const port = Number(process.env.PORT) || 3097
console.log(`Listening on http://localhost:${port}\nDocs at http://localhost:${port}/docs`)
Bun.serve({ fetch: app.fetch, port })

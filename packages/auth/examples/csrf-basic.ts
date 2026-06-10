import { Hono } from "hono"
import { generateCsrf, validateCsrf } from "../src/csrf.js"
import { session } from "../src/hono.js"

const app = new Hono()

app.use(
  "*",
  session({
    password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
    cookieName: "my-session",
  }),
)

// Render a form with a CSRF token
app.get("/form", async (c) => {
  const token = await generateCsrf(c.var.session)
  await c.var.session.save()
  return c.html(`
    <form method="POST" action="/submit">
      <input type="hidden" name="_csrf" value="${token}" />
      <input name="data" placeholder="Enter data" />
      <button>Submit</button>
    </form>
  `)
})

// Submit endpoint — validate CSRF token
app.post("/submit", async (c) => {
  const form = await c.req.parseBody<{ _csrf: string; data: string }>()
  if (!validateCsrf(c.var.session, form._csrf)) {
    return c.json({ error: "invalid CSRF token" }, 403)
  }
  return c.json({ ok: true, data: form.data })
})

export default app

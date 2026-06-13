import { HTTPException } from "hono/http-exception"

export const http = {
  conflict: (message = "Conflict") => new HTTPException(409, { message }),
  notFound: (message = "Not found") => new HTTPException(404, { message }),
  unauthorized: (message = "Unauthorized") => new HTTPException(401, { message }),
  forbidden: (message = "Forbidden") => new HTTPException(403, { message }),
  badRequest: (message = "Bad request") => new HTTPException(400, { message }),
}

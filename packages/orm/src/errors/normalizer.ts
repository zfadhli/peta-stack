import { DatabaseError } from "./classes.js"

interface RawError {
  code?: string
  errno?: number
  message?: string
}

export function normalizeError(e: unknown, table?: string): DatabaseError {
  const raw = e as RawError
  const msg = raw.message ?? ""

  // Bun SQLite: code = "SQLITE_CONSTRAINT_UNIQUE", errno = 2067
  if (raw.code === "SQLITE_CONSTRAINT_UNIQUE" || raw.code === "SQLITE_CONSTRAINT") {
    return new DatabaseError(`Unique constraint violation on ${table}: ${msg}`, "UNIQUE_CONSTRAINT", table, msg)
  }
  if (raw.code === "SQLITE_CONSTRAINT_FOREIGNKEY" || raw.code === "SQLITE_CONSTRAINT_FOREIGN_KEY") {
    return new DatabaseError(
      `Foreign key constraint violation on ${table}: ${msg}`,
      "FOREIGN_KEY_CONSTRAINT",
      table,
      msg,
    )
  }
  if (raw.code === "SQLITE_CONSTRAINT_NOTNULL" || raw.code === "SQLITE_CONSTRAINT_NOT_NULL") {
    return new DatabaseError(`Not null constraint violation on ${table}: ${msg}`, "NOT_NULL_CONSTRAINT", table, msg)
  }
  if (raw.code === "SQLITE_CONSTRAINT_CHECK") {
    return new DatabaseError(`Check constraint violation on ${table}: ${msg}`, "CHECK_CONSTRAINT", table, msg)
  }

  // SQLite generic constraint (errno 19 or 2067)
  if (raw.errno === 19 || raw.errno === 2067) {
    if (msg.includes("UNIQUE")) {
      return new DatabaseError(msg, "UNIQUE_CONSTRAINT", table, msg)
    }
    if (msg.includes("FOREIGN KEY")) {
      return new DatabaseError(msg, "FOREIGN_KEY_CONSTRAINT", table, msg)
    }
    if (msg.includes("NOT NULL")) {
      return new DatabaseError(msg, "NOT_NULL_CONSTRAINT", table, msg)
    }
    if (msg.includes("CHECK")) {
      return new DatabaseError(msg, "CHECK_CONSTRAINT", table, msg)
    }
  }

  // PostgreSQL error codes
  if (raw.code === "23505") {
    return new DatabaseError(msg, "UNIQUE_CONSTRAINT", table, msg)
  }
  if (raw.code === "23503") {
    return new DatabaseError(msg, "FOREIGN_KEY_CONSTRAINT", table, msg)
  }
  if (raw.code === "23502") {
    return new DatabaseError(msg, "NOT_NULL_CONSTRAINT", table, msg)
  }

  // MySQL error codes
  if (raw.code === "ER_DUP_ENTRY" || raw.errno === 1062) {
    return new DatabaseError(`Unique constraint violation on ${table}: ${msg}`, "UNIQUE_CONSTRAINT", table, msg)
  }
  if (raw.code === "ER_NO_REFERENCED_ROW_2" || raw.errno === 1452) {
    return new DatabaseError(
      `Foreign key constraint violation on ${table}: ${msg}`,
      "FOREIGN_KEY_CONSTRAINT",
      table,
      msg,
    )
  }
  if (raw.code === "ER_BAD_NULL_ERROR" || raw.errno === 1048) {
    return new DatabaseError(`Not null constraint violation on ${table}: ${msg}`, "NOT_NULL_CONSTRAINT", table, msg)
  }

  return new DatabaseError(msg || "Unknown database error", "UNKNOWN", table, msg)
}

export type DatabaseErrorCode =
  | "UNIQUE_CONSTRAINT"
  | "FOREIGN_KEY_CONSTRAINT"
  | "NOT_NULL_CONSTRAINT"
  | "CHECK_CONSTRAINT"
  | "MISSING_ID"
  | "RELATION_NOT_FOUND"
  | "MODEL_NOT_REGISTERED"
  | "UNKNOWN"

export class ValidationError extends Error {
  override name = "ValidationError" as const
}

export class ModelNotFoundError extends Error {
  override name = "ModelNotFoundError" as const

  constructor(model: string, id: ModelIdValue) {
    super(`${model} with id ${id} not found`)
  }
}

type ModelIdValue = number | string | bigint

export class RelationNotFoundError extends Error {
  override name = "RelationNotFoundError" as const

  constructor(model: string, relation: string) {
    super(`Relation "${relation}" not found on ${model}`)
  }
}

export class RelationNotAllowedError extends Error {
  override name = "RelationNotAllowedError" as const

  constructor(model: string, relation: string) {
    super(`Relation "${relation}" is not in the allowGraph whitelist for ${model}`)
  }
}

export class ModelNotRegisteredError extends Error {
  override name = "ModelNotRegisteredError" as const

  constructor(model: string) {
    super(`Model "${model}" is not registered. Call orm.register() or pass it to createORM()`)
  }
}

export class DatabaseError extends Error {
  override name = "DatabaseError" as const
  code: DatabaseErrorCode
  table?: string
  detail?: string

  constructor(message: string, code: DatabaseErrorCode, table?: string, detail?: string) {
    super(message)
    this.code = code
    this.table = table
    this.detail = detail
  }
}

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

  return new DatabaseError(msg || "Unknown database error", "UNKNOWN", table, msg)
}

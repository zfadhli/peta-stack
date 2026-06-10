export class ValidationError extends Error {
  readonly errors: unknown
  constructor(message: string, errors?: unknown) {
    super(message)
    this.name = "ValidationError"
    this.errors = errors
  }
}

export class ModelNotFoundError extends Error {
  readonly modelClass?: string
  readonly id?: number | string
  constructor(modelClass?: string, id?: number | string) {
    const message = modelClass ? `${modelClass} with id ${id} not found` : "Model not found"
    super(message)
    this.name = "ModelNotFoundError"
    this.modelClass = modelClass
    this.id = id
  }
}

export class RelationNotFoundError extends Error {
  readonly modelClass?: string
  readonly relationName?: string
  constructor(modelClass?: string, relationName?: string) {
    const message = modelClass ? `Relation "${relationName}" not found on ${modelClass}` : "Relation not found"
    super(message)
    this.name = "RelationNotFoundError"
    this.modelClass = modelClass
    this.relationName = relationName
  }
}

export class ModelNotRegisteredError extends Error {
  readonly modelClass?: string
  constructor(modelClass?: string) {
    const message = modelClass ? `${modelClass} is not registered with Peta` : "Model not registered with Peta"
    super(message)
    this.name = "ModelNotRegisteredError"
    this.modelClass = modelClass
  }
}

export type DatabaseErrorCode =
  | "UNIQUE_CONSTRAINT"
  | "FOREIGN_KEY_CONSTRAINT"
  | "MISSING_ID"
  | "NO_PETA"
  | "DISCOVER_REQUIRES_BUN"
  | "INVALID_COLUMN_REFERENCE"
  | "MODEL_STATE_NOT_INITIALIZED"
  | "UNKNOWN"

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode
  override readonly cause?: unknown
  readonly table?: string
  constructor(code: DatabaseErrorCode, message: string, cause?: unknown, table?: string) {
    super(message)
    this.name = "DatabaseError"
    this.code = code
    this.cause = cause
    this.table = table
  }
}

const UNIQUE_CODES = new Set(["SQLITE_CONSTRAINT_UNIQUE", "SQLITE_CONSTRAINT_PRIMARYKEY", "23505", "ER_DUP_ENTRY"])
const FOREIGN_KEY_CODES = new Set(["SQLITE_CONSTRAINT_FOREIGNKEY", "23503", "ER_NO_REFERENCED_ROW_2"])

function isErrorLike(value: unknown): value is { code: unknown; column?: unknown } {
  return typeof value === "object" && value !== null
}

export function normalizeError(e: unknown, table?: string): DatabaseError | null {
  if (!isErrorLike(e)) return null
  if (typeof e.code !== "string") return null
  if (UNIQUE_CODES.has(e.code)) {
    const col = typeof e.column === "string" ? ` on ${e.column}` : ""
    return new DatabaseError("UNIQUE_CONSTRAINT", `Unique constraint violation${col}`, e, table)
  }
  if (FOREIGN_KEY_CODES.has(e.code)) {
    return new DatabaseError("FOREIGN_KEY_CONSTRAINT", "Foreign key constraint violation", e, table)
  }
  return null
}

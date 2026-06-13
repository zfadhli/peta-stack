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

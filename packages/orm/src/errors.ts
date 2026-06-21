// Barrel — re-exports error classes from ./errors/classes.ts
// and the dialect-aware normalizer from ./errors/normalizer.ts
//
// Consumers can import from this barrel (no import path changes needed)
// or import directly from the sub-modules for better locality:
//   import { normalizeError } from "./errors/normalizer.js"
//   import { DatabaseError } from "./errors/classes.js"

export type { DatabaseErrorCode } from "./errors/classes.js"
export {
  DatabaseError,
  ModelNotFoundError,
  ModelNotRegisteredError,
  RelationNotAllowedError,
  RelationNotFoundError,
  ValidationError,
} from "./errors/classes.js"
export { isUniqueConstraintError, normalizeError } from "./errors/normalizer.js"

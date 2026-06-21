/**
 * Diagnostic emitter for peta-docs.
 *
 * Override `setOnDiagnostic` to integrate with your app's logging system.
 * By default, warnings go to `console.warn`.
 *
 * @module
 */

export type DiagnosticLevel = "warn" | "error"

export interface Diagnostic {
  level: DiagnosticLevel
  message: string
  code: string // machine-readable, e.g. "SCHEMA_NOT_ARKTYPE"
  source?: string // file or module name
}

let _onDiagnostic: ((diag: Diagnostic) => void) | null = null

export function setOnDiagnostic(handler: ((diag: Diagnostic) => void) | null): void {
  _onDiagnostic = handler
}

export function emitDiagnostic(diag: Diagnostic): void {
  if (_onDiagnostic) {
    _onDiagnostic(diag)
    return
  }
  // Default behavior
  if (diag.level === "warn") console.warn(diag.message)
  else console.error(diag.message)
}

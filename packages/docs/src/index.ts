/**
 * peta-docs — OpenAPI + Scalar docs powered by Standard Schema.
 *
 * Core module exports spec building and UI helpers.
 * Framework adapters are in sub-path exports:
 *   - `peta-docs/hono` — Hono RouteBuilder + scanner + loader
 *
 * @module
 */

export type { ScalarUIOptions } from "./scalar.ts"
export { serveScalarUI } from "./scalar.ts"
export { buildOpenAPISpec, getOpenAPISpec, toOpenAPISchema } from "./spec.ts"
export type {
  ArkTypeSchema,
  FieldsetParams,
  FilterDef,
  FilterFields,
  FilterOperator,
  InfoObject,
  OpenAPIObject,
  Pagination,
  PathItemObject,
  ResponseValue,
  RouteConfig,
  RouteEntry,
  RouteScanner,
  SchemaObject,
  StatusCode,
  TypedContext,
} from "./types.ts"

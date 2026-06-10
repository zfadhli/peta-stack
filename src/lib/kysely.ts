import type { Kysely } from "kysely"
export type Database = Kysely<Record<string, never>>

import type { ORMLike } from "../types.js"

export interface PetaElysiaPluginOptions {
  peta: ORMLike
}

/**
 * Elysia.js plugin that attaches the ORM instance to the app context.
 */
export function petaPlugin(options: PetaElysiaPluginOptions) {
  return (app: any) => app.decorate("peta", options.peta)
}

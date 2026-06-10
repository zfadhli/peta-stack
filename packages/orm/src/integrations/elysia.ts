import type { PetaLike } from "../types.js"
export interface PetaElysiaPluginOptions {
  peta: PetaLike
}
export function petaPlugin(options: PetaElysiaPluginOptions) {
  const { peta } = options
  return (app: Record<string, unknown>) => {
    ;(app as Record<string, unknown>).peta = peta
    return app
  }
}

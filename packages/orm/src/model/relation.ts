import type { ModelDefinition, ModelInstance } from "./types.js"

// ─── LAZY LOAD RELATIONS ────────────────────────────────────
export async function loadModelRelations(
  model: ModelInstance,
  def: ModelDefinition,
  ...relations: string[]
): Promise<void> {
  // Delegate to EagerLoader
  const { EagerLoader } = await import("../relations/eager.js")
  const loader = new EagerLoader()
  for (const rel of relations) {
    await loader.loadRelatedForModel(model, rel as any, def)
  }
}

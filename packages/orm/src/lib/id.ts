declare const brand: unique symbol
export type ModelId = number & { [brand]: "ModelId" }

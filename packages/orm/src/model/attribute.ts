import type { ModelInstance } from "./types.js"

/**
 * Defines an accessor (`get`) and/or mutator (`set`) for a model attribute.
 *
 * ### Accessor (get)
 * Transforms the attribute value when read via `model.get()` or `model.$toJSON()`.
 * Receives the casted value and the model instance.
 *
 * ### Mutator (set)
 * Transforms the attribute value when written via `model.set()`, `model.fill()`,
 * or during model creation (`Model.insert()` / `Model.create()`).
 * Receives the raw input value and the model instance, returns the value to store.
 * Applied **before** type casting.
 *
 * ### Usage
 * ```ts
 * defineModel('users', {
 *   columns: { id, name, password, ... },
 *   attributes: {
 *     password: Attribute.make({
 *       set: (value) => Bun.password.hashSync(value, { algorithm: 'bcrypt' }),
 *       get: () => '***',
 *     }),
 *     fullName: Attribute.make({
 *       get: (_, instance) => `${instance.get('firstName')} ${instance.get('lastName')}`,
 *     }),
 *   },
 * })
 * ```
 */
export class Attribute<T = any> {
  private constructor(
    public readonly get?: (value: T, instance: ModelInstance) => any,
    public readonly set?: (value: any, instance: ModelInstance) => T,
  ) {}

  static make<T = any>(config: {
    /** Transform the attribute value when read. Receives (castedValue, instance). */
    get?: (value: T, instance: ModelInstance) => any
    /** Transform the attribute value when written. Receives (rawValue, instance), returns value to store. */
    set?: (value: any, instance: ModelInstance) => T
  }): Attribute<T> {
    if (!config.get && !config.set) {
      throw new Error("Attribute.make() requires at least one of `get` or `set`")
    }
    return new Attribute(config.get, config.set)
  }
}

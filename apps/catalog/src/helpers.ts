/** Pick specific keys from a serialized model JSON object */
export function pick<T extends Record<string, unknown>, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of keys) result[key] = obj[key]
  return result
}

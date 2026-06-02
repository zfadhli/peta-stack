import { EagerLoader } from "../builder"
import type { Model, ModelClass } from "../model/model"

export class Collection<T extends Model> {
  #items: T[] = []

  constructor(items: T[] = []) {
    this.#items = [...items]
  }

  get length(): number {
    return this.#items.length
  }

  [Symbol.iterator](): Iterator<T> {
    return this.#items[Symbol.iterator]()
  }

  at(index: number): T | undefined {
    return this.#items[index]
  }

  first(): T | undefined {
    return this.#items[0]
  }

  last(): T | undefined {
    return this.#items[this.#items.length - 1]
  }

  all(): T[] {
    return [...this.#items]
  }

  findBy(id: number | string): T | undefined {
    return this.#items.find((item) => item.get("id") === id)
  }

  pluck(key: string): readonly unknown[] {
    return this.#items.map((item) => item.get(key))
  }

  groupBy(key: string): Record<string, T[]> {
    const result: Record<string, T[]> = {}
    for (const item of this.#items) {
      const k = String(item.get(key))
      if (!result[k]) result[k] = []
      result[k].push(item)
    }
    return result
  }

  keyBy(key: string): Record<string, T> {
    const result: Record<string, T> = {}
    for (const item of this.#items) {
      const k = String(item.get(key))
      result[k] = item
    }
    return result
  }

  toJSON(): Record<string, unknown>[] {
    return this.#items.map((item) => item.$toJSON())
  }

  map<U>(fn: (item: T, index: number) => U): U[] {
    return this.#items.map(fn)
  }

  filter(fn: (item: T, index: number) => boolean): Collection<T> {
    return new Collection(this.#items.filter(fn))
  }

  reduce<U>(fn: (acc: U, item: T, index: number) => U, initial: U): U {
    return this.#items.reduce(fn, initial)
  }

  forEach(fn: (item: T, index: number) => void): void {
    this.#items.forEach(fn)
  }

  find(fn: (item: T) => boolean): T | undefined {
    return this.#items.find(fn)
  }

  some(fn: (item: T) => boolean): boolean {
    return this.#items.some(fn)
  }

  includes(item: T): boolean {
    return this.#items.includes(item)
  }

  async load(...relations: string[]): Promise<this> {
    if (this.#items.length === 0) return this
    const modelClass = (this.#items[0] as any).constructor as ModelClass
    const loader = new EagerLoader()
    await loader.load(modelClass, {}, this.#items as Model[], relations)
    return this
  }

  get(key: string): unknown[] {
    return this.#items.map((item) => item.get(key))
  }

  isEmpty(): this is Collection<T> & { length: 0 } {
    return this.#items.length === 0
  }

  isNotEmpty(): this is { length: number } {
    return this.#items.length > 0
  }

  sum(key: string): number {
    return this.#items.reduce((acc, item) => acc + (Number(item.get(key)) || 0), 0)
  }

  avg(key: string): number {
    if (this.#items.length === 0) return 0
    return this.sum(key) / this.#items.length
  }

  min(key: string): number | undefined {
    const values = this.pluck(key) as number[]
    if (values.length === 0) return undefined
    return Math.min(...values.filter((v) => typeof v === "number"))
  }

  max(key: string): number | undefined {
    const values = this.pluck(key) as number[]
    if (values.length === 0) return undefined
    return Math.max(...values.filter((v) => typeof v === "number"))
  }

  contains(value: unknown, key?: string): boolean {
    if (key) {
      return this.#items.some((item) => item.get(key) === value)
    }
    return this.#items.some((item) => item === value)
  }

  unique(key: string): Collection<T> {
    const seen = new Set<unknown>()
    return new Collection(
      this.#items.filter((item) => {
        const val = item.get(key)
        if (seen.has(val)) return false
        seen.add(val)
        return true
      }),
    )
  }

  sortBy(key: string, direction: "asc" | "desc" = "asc"): Collection<T> {
    const items = [...this.#items].sort((a, b) => {
      const av = String(a.get(key))
      const bv = String(b.get(key))
      if (av < bv) return direction === "asc" ? -1 : 1
      if (av > bv) return direction === "asc" ? 1 : -1
      return 0
    })
    return new Collection(items)
  }

  shuffle(): Collection<T> {
    const items = [...this.#items]
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = items[i]!
      items[i] = items[j]!
      items[j] = tmp
    }
    return new Collection(items)
  }

  take(n: number): Collection<T> {
    return new Collection(this.#items.slice(0, n))
  }

  skip(n: number): Collection<T> {
    return new Collection(this.#items.slice(n))
  }

  chunk(size: number): Collection<T>[] {
    const chunks: Collection<T>[] = []
    for (let i = 0; i < this.#items.length; i += size) {
      chunks.push(new Collection(this.#items.slice(i, i + size)))
    }
    return chunks
  }

  each(fn: (item: T, index: number) => void): this {
    this.#items.forEach(fn)
    return this
  }

  diff(other: Collection<T>): Collection<T> {
    const ids = new Set(other.pluck("id"))
    return new Collection(this.#items.filter((item) => !ids.has(item.get("id"))))
  }

  intersect(other: Collection<T>): Collection<T> {
    const ids = new Set(other.pluck("id"))
    return new Collection(this.#items.filter((item) => ids.has(item.get("id"))))
  }

  push(...items: T[]): void {
    this.#items.push(...items)
  }

  concat(other: Collection<T> | T[]): Collection<T> {
    const otherItems = other instanceof Collection ? other.all() : other
    return new Collection([...this.#items, ...otherItems])
  }
}

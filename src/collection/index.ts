import type { ModelInstance } from "../model/index.js"

export interface Collection {
  readonly length: number
  [Symbol.iterator](): Iterator<ModelInstance>
  at(index: number): ModelInstance | undefined
  first(): ModelInstance | undefined
  last(): ModelInstance | undefined
  all(): ModelInstance[]
  findBy(id: number | string): ModelInstance | undefined
  pluck(key: string): readonly unknown[]
  groupBy(key: string): Record<string, ModelInstance[]>
  keyBy(key: string): Record<string, ModelInstance>
  toJSON(): Record<string, unknown>[]
  map<U>(fn: (item: ModelInstance, index: number) => U): U[]
  filter(fn: (item: ModelInstance, index: number) => boolean): Collection
  reduce<U>(fn: (acc: U, item: ModelInstance, index: number) => U, initial: U): U
  forEach(fn: (item: ModelInstance, index: number) => void): void
  find(fn: (item: ModelInstance) => boolean): ModelInstance | undefined
  some(fn: (item: ModelInstance) => boolean): boolean
  includes(item: ModelInstance): boolean
  isEmpty(): boolean
  isNotEmpty(): boolean
  get(key: string): unknown[]
  sum(key: string): number
  avg(key: string): number
  min(key: string): number | undefined
  max(key: string): number | undefined
  contains(value: unknown, key?: string): boolean
  unique(key: string): Collection
  sortBy(key: string, direction?: "asc" | "desc"): Collection
  shuffle(): Collection
  take(n: number): Collection
  skip(n: number): Collection
  chunk(size: number): Collection[]
  each(fn: (item: ModelInstance, index: number) => void): Collection
  diff(other: Collection): Collection
  intersect(other: Collection): Collection
  push(...items: ModelInstance[]): void
  concat(other: Collection | ModelInstance[]): Collection
  load(...relations: string[]): Promise<Collection>
}

export function createCollection(items: ModelInstance[] = []): Collection {
  const _items = [...items]
  function toNewCollection(newItems: ModelInstance[]): Collection {
    return createCollection(newItems)
  }
  const instance: Collection = {
    get length(): number {
      return _items.length
    },
    [Symbol.iterator](): Iterator<ModelInstance> {
      return _items[Symbol.iterator]()
    },
    at(index: number): ModelInstance | undefined {
      return _items[index]
    },
    first(): ModelInstance | undefined {
      return _items[0]
    },
    last(): ModelInstance | undefined {
      return _items[_items.length - 1]
    },
    all(): ModelInstance[] {
      return [..._items]
    },
    findBy(id: number | string): ModelInstance | undefined {
      return _items.find((item) => item.get("id") === id)
    },
    pluck(key: string): readonly unknown[] {
      return _items.map((item) => item.get(key))
    },
    groupBy(key: string): Record<string, ModelInstance[]> {
      const result: Record<string, ModelInstance[]> = {}
      for (const item of _items) {
        const k = String(item.get(key))
        if (!result[k]) result[k] = []
        result[k].push(item)
      }
      return result
    },
    keyBy(key: string): Record<string, ModelInstance> {
      const result: Record<string, ModelInstance> = {}
      for (const item of _items) {
        const k = String(item.get(key))
        result[k] = item
      }
      return result
    },
    toJSON(): Record<string, unknown>[] {
      return _items.map((item) => item.$toJSON())
    },
    map<U>(fn: (item: ModelInstance, index: number) => U): U[] {
      return _items.map(fn)
    },
    filter(fn: (item: ModelInstance, index: number) => boolean): Collection {
      return toNewCollection(_items.filter(fn))
    },
    reduce<U>(fn: (acc: U, item: ModelInstance, index: number) => U, initial: U): U {
      return _items.reduce(fn, initial)
    },
    forEach(fn: (item: ModelInstance, index: number) => void): void {
      _items.forEach(fn)
    },
    find(fn: (item: ModelInstance) => boolean): ModelInstance | undefined {
      return _items.find(fn)
    },
    some(fn: (item: ModelInstance) => boolean): boolean {
      return _items.some(fn)
    },
    includes(item: ModelInstance): boolean {
      return _items.includes(item)
    },
    isEmpty(): boolean {
      return _items.length === 0
    },
    isNotEmpty(): boolean {
      return _items.length > 0
    },
    get(key: string): unknown[] {
      return _items.map((item) => item.get(key))
    },
    sum(key: string): number {
      return _items.reduce((acc, item) => acc + (Number(item.get(key)) || 0), 0)
    },
    avg(key: string): number {
      return _items.length === 0 ? 0 : instance.sum(key) / _items.length
    },
    min(key: string): number | undefined {
      const values = _items.map((item) => item.get(key)).filter((v): v is number => typeof v === "number")
      return values.length === 0 ? undefined : Math.min(...values)
    },
    max(key: string): number | undefined {
      const values = _items.map((item) => item.get(key)).filter((v): v is number => typeof v === "number")
      return values.length === 0 ? undefined : Math.max(...values)
    },
    contains(value: unknown, key?: string): boolean {
      return key ? _items.some((item) => item.get(key) === value) : _items.some((item) => item === value)
    },
    unique(key: string): Collection {
      const seen = new Set<unknown>()
      return toNewCollection(
        _items.filter((item) => {
          const val = item.get(key)
          if (seen.has(val)) return false
          seen.add(val)
          return true
        }),
      )
    },
    sortBy(key: string, direction: "asc" | "desc" = "asc"): Collection {
      const sorted = [..._items].sort((a, b) => {
        const av = String(a.get(key)),
          bv = String(b.get(key))
        if (av < bv) return direction === "asc" ? -1 : 1
        if (av > bv) return direction === "asc" ? 1 : -1
        return 0
      })
      return toNewCollection(sorted)
    },
    shuffle(): Collection {
      const shuffled = [..._items]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
      }
      return toNewCollection(shuffled)
    },
    take(n: number): Collection {
      return toNewCollection(_items.slice(0, n))
    },
    skip(n: number): Collection {
      return toNewCollection(_items.slice(n))
    },
    chunk(size: number): Collection[] {
      const chunks: Collection[] = []
      for (let i = 0; i < _items.length; i += size) chunks.push(toNewCollection(_items.slice(i, i + size)))
      return chunks
    },
    each(fn: (item: ModelInstance, index: number) => void): Collection {
      _items.forEach(fn)
      return instance
    },
    diff(other: Collection): Collection {
      const ids = new Set(other.pluck("id"))
      return toNewCollection(_items.filter((item) => !ids.has(item.get("id"))))
    },
    intersect(other: Collection): Collection {
      const ids = new Set(other.pluck("id"))
      return toNewCollection(_items.filter((item) => ids.has(item.get("id"))))
    },
    push(...newItems: ModelInstance[]): void {
      _items.push(...newItems)
    },
    concat(other: Collection | ModelInstance[]): Collection {
      const otherItems = Array.isArray(other) ? other : other.all()
      return toNewCollection([..._items, ...otherItems])
    },
    async load(..._relations: string[]): Promise<Collection> {
      return instance
    },
  }
  return instance
}

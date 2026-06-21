import type { ColumnShape } from "../columns/column.js"
import type { ModelInstance, SerializedShape } from "../model/types.js"

export interface Collection<TColumns extends ColumnShape = ColumnShape> {
  readonly length: number
  [Symbol.iterator](): Iterator<ModelInstance<TColumns>>

  // Access
  at(index: number): ModelInstance<TColumns> | undefined
  first(): ModelInstance<TColumns> | undefined
  last(): ModelInstance<TColumns> | undefined
  all(): ModelInstance<TColumns>[]
  findBy(id: number | string): ModelInstance<TColumns> | undefined
  find(
    callback: (item: ModelInstance<TColumns>, index: number) => boolean,
  ): ModelInstance<TColumns> | undefined
  some(callback: (item: ModelInstance<TColumns>, index: number) => boolean): boolean
  includes(item: ModelInstance<TColumns>): boolean
  isEmpty(): boolean
  isNotEmpty(): boolean

  // Collection methods
  get(key: string): unknown[]
  pluck(key: string): unknown[]
  groupBy(key: string): Record<string, ModelInstance<TColumns>[]>
  keyBy(key: string): Record<string, ModelInstance<TColumns>>

  // Transformation
  map<T>(fn: (item: ModelInstance<TColumns>, index: number) => T): T[]
  filter(fn: (item: ModelInstance<TColumns>, index: number) => boolean): Collection<TColumns>
  reduce<T>(fn: (acc: T, item: ModelInstance<TColumns>, index: number) => T, initial: T): T
  forEach(fn: (item: ModelInstance<TColumns>, index: number) => void): void

  // Sorting & slicing
  unique(key?: string): Collection<TColumns>
  sortBy(key: string, direction?: "asc" | "desc"): Collection<TColumns>
  shuffle(): Collection<TColumns>
  take(n: number): Collection<TColumns>
  skip(n: number): Collection<TColumns>
  chunk(size: number): Collection<TColumns>[]

  // Aggregation
  sum(key: string): number
  avg(key: string): number
  min(key: string): number
  max(key: string): number

  // Set operations
  diff(other: Collection<TColumns>): Collection<TColumns>
  intersect(other: Collection<TColumns>): Collection<TColumns>
  concat(other: Collection<TColumns>): Collection<TColumns>
  push(...items: ModelInstance<TColumns>[]): void

  // Eager loading
  load(...relations: string[]): Promise<Collection<TColumns>>

  // Serialization
  toJSON(): SerializedShape<TColumns>[]
}

export function createCollection<TColumns extends ColumnShape = ColumnShape>(
  items?: ModelInstance<TColumns>[],
): Collection<TColumns> {
  const data: ModelInstance<TColumns>[] = [...(items ?? [])]

  const collection: Collection<TColumns> = {
    get length() {
      return data.length
    },
    [Symbol.iterator]() {
      return data[Symbol.iterator]()
    },

    at(index: number): ModelInstance<TColumns> | undefined {
      return data[index]
    },
    first(): ModelInstance<TColumns> | undefined {
      return data[0]
    },
    last(): ModelInstance<TColumns> | undefined {
      return data[data.length - 1]
    },
    all(): ModelInstance<TColumns>[] {
      return [...data]
    },
    findBy(id: number | string): ModelInstance<TColumns> | undefined {
      return data.find((d) => d.get("id") === id)
    },
    find(
      callback: (item: ModelInstance<TColumns>, index: number) => boolean,
    ): ModelInstance<TColumns> | undefined {
      return data.find(callback)
    },
    some(callback: (item: ModelInstance<TColumns>, index: number) => boolean): boolean {
      return data.some(callback)
    },
    includes(item: ModelInstance<TColumns>): boolean {
      return data.includes(item)
    },
    isEmpty(): boolean {
      return data.length === 0
    },
    isNotEmpty(): boolean {
      return data.length > 0
    },

    get(key: string): unknown[] {
      return data.map((d) => d.get(key))
    },
    pluck(key: string): unknown[] {
      return this.get(key)
    },

    groupBy(key: string): Record<string, ModelInstance<TColumns>[]> {
      const result: Record<string, ModelInstance<TColumns>[]> = {}
      for (const item of data) {
        const v = String(item.get(key))
        if (!result[v]) result[v] = []
        result[v].push(item)
      }
      return result
    },

    keyBy(key: string): Record<string, ModelInstance<TColumns>> {
      const result: Record<string, ModelInstance<TColumns>> = {}
      for (const item of data) {
        result[String(item.get(key))] = item
      }
      return result
    },

    map<T>(fn: (item: ModelInstance<TColumns>, index: number) => T): T[] {
      return data.map(fn)
    },

    filter(fn: (item: ModelInstance<TColumns>, index: number) => boolean): Collection<TColumns> {
      return createCollection(data.filter(fn))
    },

    reduce<T>(fn: (acc: T, item: ModelInstance<TColumns>, index: number) => T, initial: T): T {
      return data.reduce(fn, initial)
    },

    forEach(fn: (item: ModelInstance<TColumns>, index: number) => void): void {
      data.forEach(fn)
    },

    unique(key?: string): Collection<TColumns> {
      if (!key) {
        const seen = new Set<number>()
        return createCollection(
          data.filter((d) => {
            const id = d.get("id") as number
            if (seen.has(id)) return false
            seen.add(id)
            return true
          }),
        )
      }
      const seen = new Set<unknown>()
      return createCollection(
        data.filter((d) => {
          const v = d.get(key)
          if (seen.has(v)) return false
          seen.add(v)
          return true
        }),
      )
    },

    sortBy(key: string, direction: "asc" | "desc" = "asc"): Collection<TColumns> {
      const sorted = [...data].sort((a, b) => {
        const va = a.get(key) as any
        const vb = b.get(key) as any
        if (va < vb) return direction === "asc" ? -1 : 1
        if (va > vb) return direction === "asc" ? 1 : -1
        return 0
      })
      return createCollection(sorted)
    },

    shuffle(): Collection<TColumns> {
      const shuffled: ModelInstance<TColumns>[] = [...data]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = shuffled[i]!
        shuffled[i] = shuffled[j]!
        shuffled[j] = temp
      }
      return createCollection(shuffled)
    },

    take(n: number): Collection<TColumns> {
      return createCollection(data.slice(0, n))
    },
    skip(n: number): Collection<TColumns> {
      return createCollection(data.slice(n))
    },

    chunk(size: number): Collection<TColumns>[] {
      const chunks: Collection<TColumns>[] = []
      for (let i = 0; i < data.length; i += size) {
        chunks.push(createCollection(data.slice(i, i + size)))
      }
      return chunks
    },

    sum(key: string): number {
      return data.reduce((acc, d) => acc + (Number(d.get(key)) || 0), 0)
    },
    avg(key: string): number {
      return data.length === 0 ? 0 : this.sum(key) / data.length
    },
    min(key: string): number {
      return Math.min(...data.map((d) => Number(d.get(key)) || 0))
    },
    max(key: string): number {
      return Math.max(...data.map((d) => Number(d.get(key)) || 0))
    },

    diff(other: Collection<TColumns>): Collection<TColumns> {
      const otherIds = new Set(other.pluck("id") as number[])
      return createCollection(data.filter((d) => !otherIds.has(d.get("id") as number)))
    },

    intersect(other: Collection<TColumns>): Collection<TColumns> {
      const otherIds = new Set(other.pluck("id") as number[])
      return createCollection(data.filter((d) => otherIds.has(d.get("id") as number)))
    },

    concat(other: Collection<TColumns>): Collection<TColumns> {
      return createCollection([...data, ...other.all()])
    },

    push(...items: ModelInstance<TColumns>[]): void {
      data.push(...items)
    },

    async load(...relations: string[]) {
      if (data.length === 0) return collection
      const { EagerLoader } = await import("../relations/eager.js")
      const { getModelDefFromInstance } = await import("../model/factory.js")
      const first = data[0]!
      const def = getModelDefFromInstance(first)
      if (def) {
        const loader = new EagerLoader()
        for (const rel of relations) {
          await loader.loadRelated(data as any, { name: rel }, def as any)
        }
      }
      return collection
    },

    toJSON(): SerializedShape<TColumns>[] {
      return data.map((d) => d.toJSON()) as SerializedShape<TColumns>[]
    },
  }

  return collection
}

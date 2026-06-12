import type { ModelInstance } from "../model/types.js"

export interface Collection {
  readonly length: number
  [Symbol.iterator](): Iterator<ModelInstance>

  // Access
  at(index: number): ModelInstance | undefined
  first(): ModelInstance | undefined
  last(): ModelInstance | undefined
  all(): ModelInstance[]
  findBy(id: number | string): ModelInstance | undefined
  find(callback: (item: ModelInstance, index: number) => boolean): ModelInstance | undefined
  some(callback: (item: ModelInstance, index: number) => boolean): boolean
  includes(item: ModelInstance): boolean
  isEmpty(): boolean
  isNotEmpty(): boolean

  // Collection methods
  get(key: string): unknown[]
  pluck(key: string): unknown[]
  groupBy(key: string): Record<string, ModelInstance[]>
  keyBy(key: string): Record<string, ModelInstance>

  // Transformation
  map<T>(fn: (item: ModelInstance, index: number) => T): T[]
  filter(fn: (item: ModelInstance, index: number) => boolean): Collection
  reduce<T>(fn: (acc: T, item: ModelInstance, index: number) => T, initial: T): T
  forEach(fn: (item: ModelInstance, index: number) => void): void
  each(fn: (item: ModelInstance, index: number) => void): Collection

  // Sorting & slicing
  unique(key?: string): Collection
  sortBy(key: string, direction?: "asc" | "desc"): Collection
  shuffle(): Collection
  take(n: number): Collection
  skip(n: number): Collection
  chunk(size: number): Collection[]

  // Aggregation
  sum(key: string): number
  avg(key: string): number
  min(key: string): number
  max(key: string): number

  // Set operations
  diff(other: Collection): Collection
  intersect(other: Collection): Collection
  concat(other: Collection): Collection
  push(...items: ModelInstance[]): void

  // Eager loading
  load(...relations: string[]): Promise<Collection>

  // Serialization
  toJSON(): Record<string, unknown>[]
}

export function createCollection(items?: ModelInstance[]): Collection {
  const data: ModelInstance[] = [...(items ?? [])]

  const collection: Collection = {
    get length() {
      return data.length
    },
    [Symbol.iterator]() {
      return data[Symbol.iterator]()
    },

    at(index: number): ModelInstance | undefined {
      return data[index]
    },
    first(): ModelInstance | undefined {
      return data[0]
    },
    last(): ModelInstance | undefined {
      return data[data.length - 1]
    },
    all(): ModelInstance[] {
      return [...data]
    },
    findBy(id: number | string): ModelInstance | undefined {
      return data.find((d) => d.get("id") === id)
    },
    find(callback: (item: ModelInstance, index: number) => boolean): ModelInstance | undefined {
      return data.find(callback)
    },
    some(callback: (item: ModelInstance, index: number) => boolean): boolean {
      return data.some(callback)
    },
    includes(item: ModelInstance): boolean {
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
      return data.map((d) => d.get(key))
    },

    groupBy(key: string): Record<string, ModelInstance[]> {
      const result: Record<string, ModelInstance[]> = {}
      for (const item of data) {
        const v = String(item.get(key))
        if (!result[v]) result[v] = []
        result[v].push(item)
      }
      return result
    },

    keyBy(key: string): Record<string, ModelInstance> {
      const result: Record<string, ModelInstance> = {}
      for (const item of data) {
        result[String(item.get(key))] = item
      }
      return result
    },

    map<T>(fn: (item: ModelInstance, index: number) => T): T[] {
      return data.map(fn)
    },

    filter(fn: (item: ModelInstance, index: number) => boolean): Collection {
      return createCollection(data.filter(fn))
    },

    reduce<T>(fn: (acc: T, item: ModelInstance, index: number) => T, initial: T): T {
      return data.reduce(fn, initial)
    },

    forEach(fn: (item: ModelInstance, index: number) => void): void {
      data.forEach(fn)
    },

    each(fn: (item: ModelInstance, index: number) => void): Collection {
      data.forEach(fn)
      return collection
    },

    unique(key?: string): Collection {
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

    sortBy(key: string, direction: "asc" | "desc" = "asc"): Collection {
      const sorted = [...data].sort((a, b) => {
        const va = a.get(key) as any
        const vb = b.get(key) as any
        if (va < vb) return direction === "asc" ? -1 : 1
        if (va > vb) return direction === "asc" ? 1 : -1
        return 0
      })
      return createCollection(sorted)
    },

    shuffle(): Collection {
      const shuffled: ModelInstance[] = [...data]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = shuffled[i]!
        shuffled[i] = shuffled[j]!
        shuffled[j] = temp
      }
      return createCollection(shuffled)
    },

    take(n: number): Collection {
      return createCollection(data.slice(0, n))
    },
    skip(n: number): Collection {
      return createCollection(data.slice(n))
    },

    chunk(size: number): Collection[] {
      const chunks: Collection[] = []
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

    diff(other: Collection): Collection {
      const otherIds = new Set(other.pluck("id") as number[])
      return createCollection(data.filter((d) => !otherIds.has(d.get("id") as number)))
    },

    intersect(other: Collection): Collection {
      const otherIds = new Set(other.pluck("id") as number[])
      return createCollection(data.filter((d) => otherIds.has(d.get("id") as number)))
    },

    concat(other: Collection): Collection {
      return createCollection([...data, ...other.all()])
    },

    push(...items: ModelInstance[]): void {
      data.push(...items)
    },

    async load(...relations: string[]) {
      if (data.length === 0) return collection
      const { EagerLoader } = await import("../relations/eager.js")
      const { getModelDefFromInstance } = await import("../model/factory.js")
      const { getModelDef } = await import("../model/relation.js")
      const def = getModelDefFromInstance(data[0]) ?? getModelDef(data[0])
      if (def) {
        const loader = new EagerLoader()
        for (const rel of relations) {
          await loader.loadRelated(data as any, { name: rel }, def as any)
        }
      }
      return collection
    },

    toJSON(): Record<string, unknown>[] {
      return data.map((d) => d.toJSON())
    },
  }

  return collection
}

async function _getDef(model: any): Promise<any> {
  const { getModelDef } = await import("../model/relation.js")
  return getModelDef(model)
}

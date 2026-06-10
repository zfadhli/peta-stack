import type { Collection } from "../collection/index.js"
import { createCollection } from "../collection/index.js"
import type { ModelInstance } from "../model/index.js"

export interface Paginator {
  readonly data: Collection
  readonly total: number
  readonly perPage: number
  readonly currentPage: number
  readonly lastPage: number
  readonly hasMorePages: boolean
  readonly hasPages: boolean
  readonly firstItem: number
  readonly lastItem: number
  readonly onFirstPage: boolean
  readonly onLastPage: boolean
  readonly count: number
  map<U>(callback: (item: ModelInstance, index: number) => U): U[]
  toJSON(): PaginatorJson
}

export interface PaginatorJson {
  data: Record<string, unknown>[]
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  hasMorePages: boolean
}

export type PaginatedResult = PaginatorJson

export function createPaginator(
  items: ModelInstance[],
  total: number,
  perPage: number,
  currentPage: number,
): Paginator {
  const data = createCollection(items)
  const lastPage = Math.max(Math.ceil(total / perPage), 1)
  return {
    data,
    total,
    perPage,
    currentPage,
    lastPage,
    get hasMorePages(): boolean {
      return currentPage < lastPage
    },
    get hasPages(): boolean {
      return lastPage > 1
    },
    get firstItem(): number {
      return (currentPage - 1) * perPage + 1
    },
    get lastItem(): number {
      return Math.min(this.firstItem + data.length - 1, total)
    },
    get onFirstPage(): boolean {
      return currentPage <= 1
    },
    get onLastPage(): boolean {
      return currentPage >= lastPage
    },
    get count(): number {
      return data.length
    },
    map<U>(callback: (item: ModelInstance, index: number) => U): U[] {
      return data.map(callback)
    },
    toJSON(): PaginatorJson {
      return { data: data.toJSON(), total, perPage, currentPage, lastPage, hasMorePages: currentPage < lastPage }
    },
  }
}

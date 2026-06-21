import type { Collection } from "../collection/index.js"
import { createCollection } from "../collection/index.js"
import type { ColumnShape } from "../columns/column.js"
import type { ModelInstance, SerializedShape } from "../model/types.js"

export interface Paginator<TColumns extends ColumnShape = ColumnShape> {
  readonly data: Collection<TColumns>
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
  toJSON(): PaginatorJson<TColumns>
}

export interface PaginatorJson<TColumns extends ColumnShape = ColumnShape> {
  data: SerializedShape<TColumns>[]
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  hasMorePages: boolean
  hasPages: boolean
  firstItem: number | null
  lastItem: number | null
  onFirstPage: boolean
  onLastPage: boolean
}

export function createPaginator<TColumns extends ColumnShape = ColumnShape>(
  items: ModelInstance<TColumns>[],
  total: number,
  perPage: number,
  currentPage: number,
): Paginator<TColumns> {
  const collection = createCollection<TColumns>(items)
  const lastPage = Math.max(1, Math.ceil(total / perPage))

  return {
    get data() {
      return collection
    },
    get total() {
      return total
    },
    get perPage() {
      return perPage
    },
    get currentPage() {
      return currentPage
    },
    get lastPage() {
      return lastPage
    },
    get hasMorePages() {
      return currentPage < lastPage
    },
    get hasPages() {
      return lastPage > 1
    },
    get firstItem() {
      return items.length > 0 ? (currentPage - 1) * perPage + 1 : 0
    },
    get lastItem() {
      return items.length > 0 ? (currentPage - 1) * perPage + items.length : 0
    },
    get onFirstPage() {
      return currentPage === 1
    },
    get onLastPage() {
      return currentPage >= lastPage
    },
    toJSON(): PaginatorJson<TColumns> {
      return {
        data: collection.toJSON() as SerializedShape<TColumns>[],
        total,
        perPage,
        currentPage,
        lastPage,
        hasMorePages: currentPage < lastPage,
        hasPages: lastPage > 1,
        firstItem: items.length > 0 ? (currentPage - 1) * perPage + 1 : null,
        lastItem: items.length > 0 ? (currentPage - 1) * perPage + items.length : null,
        onFirstPage: currentPage === 1,
        onLastPage: currentPage >= lastPage,
      }
    },
  }
}

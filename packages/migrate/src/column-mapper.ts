/**
 * Map a Column's dataType + args to a SQL type string.
 * Extracted from snapshot.ts, pusher.ts, generator.ts (which each had an identical copy).
 */
export function columnDataTypeToSql(dataType: string, args: readonly unknown[]): string {
  switch (dataType) {
    case "string": {
      const max = args[0] as number | undefined
      return max != null ? `varchar(${max})` : "varchar"
    }
    case "json":
    case "jsonb":
      return "json"
    case "decimal": {
      const p = args[0] as number | undefined
      const s = args[1] as number | undefined
      return p != null ? `decimal(${p}, ${s ?? 0})` : "decimal"
    }
    case "enum":
      return "text"
    default:
      // integer, smallint, bigint, text, boolean, timestamp, date, float, double, uuid pass through
      return dataType
  }
}

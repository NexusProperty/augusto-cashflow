/**
 * Pure aggregate helpers for the forecast grid's selection stats chip.
 * Kept framework-free so it can be unit-tested without React.
 */

export interface Aggregates {
  sum: number
  avg: number
  count: number
  min: number
  max: number
}

export const EMPTY_AGGREGATES: Aggregates = {
  sum: 0,
  avg: 0,
  count: 0,
  min: 0,
  max: 0,
}

export function computeAggregates(values: readonly number[]): Aggregates {
  if (values.length === 0) return EMPTY_AGGREGATES

  let sum = 0
  let min = values[0]!
  let max = values[0]!
  for (const v of values) {
    sum += v
    if (v < min) min = v
    if (v > max) max = v
  }
  return {
    sum,
    avg: sum / values.length,
    count: values.length,
    min,
    max,
  }
}

import { describe, expect, it } from 'vitest'
import { computeAggregates, EMPTY_AGGREGATES } from '@/lib/forecast/aggregates'

describe('computeAggregates', () => {
  it('returns zeros for an empty input', () => {
    expect(computeAggregates([])).toEqual(EMPTY_AGGREGATES)
  })

  it('handles a single value', () => {
    expect(computeAggregates([42])).toEqual({
      sum: 42,
      avg: 42,
      count: 1,
      min: 42,
      max: 42,
    })
  })

  it('computes sum / avg / count / min / max over many values', () => {
    const result = computeAggregates([100, 200, 50, 400, 250])
    expect(result.sum).toBe(1000)
    expect(result.count).toBe(5)
    expect(result.avg).toBe(200)
    expect(result.min).toBe(50)
    expect(result.max).toBe(400)
  })

  it('handles mixed-sign values without skewing min/max', () => {
    const result = computeAggregates([-500, 1000, -200, 300])
    expect(result.sum).toBe(600)
    expect(result.avg).toBe(150)
    expect(result.min).toBe(-500)
    expect(result.max).toBe(1000)
  })

  it('treats zero values as countable cells', () => {
    const result = computeAggregates([0, 0, 0, 100])
    expect(result.count).toBe(4)
    expect(result.sum).toBe(100)
    expect(result.avg).toBe(25)
    expect(result.min).toBe(0)
    expect(result.max).toBe(100)
  })

  it('survives all-zero input with a finite min/max (not Infinity)', () => {
    const result = computeAggregates([0, 0, 0])
    expect(result.min).toBe(0)
    expect(result.max).toBe(0)
    expect(result.sum).toBe(0)
    expect(result.avg).toBe(0)
  })
})

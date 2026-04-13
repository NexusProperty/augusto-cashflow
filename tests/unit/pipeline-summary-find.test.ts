import { describe, it, expect } from 'vitest'
import {
  buildMatchList,
  normaliseAmountQuery,
  nextMatchIndex,
  prevMatchIndex,
} from '@/lib/pipeline/summary-find'
import type { FlatSummaryRow } from '@/lib/pipeline/summary-flat-rows'

function mkRow(partial: Partial<FlatSummaryRow> & { values: number[] }): FlatSummaryRow {
  return {
    kind: 'entity-metric',
    entityId: 'e1',
    entityName: 'Acme',
    metricKey: 'totalForecast',
    metricLabel: 'Total Forecast',
    ...partial,
  }
}

describe('normaliseAmountQuery', () => {
  it('parses plain numbers', () => {
    expect(normaliseAmountQuery('1000')).toEqual({ amount: 1000, tolerance: 1 })
  })
  it('strips currency + commas', () => {
    expect(normaliseAmountQuery('$1,234')).toEqual({ amount: 1234, tolerance: 1 })
  })
  it('handles decimals', () => {
    expect(normaliseAmountQuery('$1,234.56')).toEqual({ amount: 1234.56, tolerance: 1 })
  })
  it('treats parens as negative', () => {
    expect(normaliseAmountQuery('(500)')).toEqual({ amount: -500, tolerance: 1 })
  })
  it('returns null for non-numeric', () => {
    expect(normaliseAmountQuery('abc')).toBeNull()
    expect(normaliseAmountQuery('')).toBeNull()
    expect(normaliseAmountQuery('  ')).toBeNull()
  })
})

describe('buildMatchList', () => {
  const monthsLen = 3

  it('returns [] for empty query', () => {
    const rows = [mkRow({ values: [1, 2, 3] })]
    expect(buildMatchList(rows, monthsLen, '')).toEqual([])
    expect(buildMatchList(rows, monthsLen, '   ')).toEqual([])
  })

  it('entity hit (case-insensitive substring, one row-level match)', () => {
    const rows = [
      mkRow({ entityName: 'Paul Smith Loan', values: [0, 0, 0] }),
      mkRow({ entityName: 'Other', values: [0, 0, 0] }),
    ]
    const m = buildMatchList(rows, monthsLen, 'paul')
    expect(m).toEqual([{ row: 0, col: null, hitKind: 'entity' }])
  })

  it('metric-label hit', () => {
    const rows = [
      mkRow({ metricLabel: 'Variance', values: [0, 0, 0], entityName: 'X' }),
    ]
    const m = buildMatchList(rows, monthsLen, 'variance')
    expect(m).toEqual([{ row: 0, col: null, hitKind: 'metric' }])
  })

  it('amount hit via numeric normalisation ("1000" matches 1000)', () => {
    const rows = [mkRow({ values: [100, 1000, 50], entityName: 'X', metricLabel: 'Y' })]
    const m = buildMatchList(rows, monthsLen, '1000')
    expect(m).toEqual([{ row: 0, col: 1, hitKind: 'amount' }])
  })

  it('amount hit via raw formatted string ("$1,000" matches 1000 cell)', () => {
    const rows = [mkRow({ values: [100, 1000, 50], entityName: 'X', metricLabel: 'Y' })]
    const m = buildMatchList(rows, monthsLen, '$1,000')
    expect(m.some((x) => x.row === 0 && x.col === 1 && x.hitKind === 'amount')).toBe(true)
  })

  it('amount hit includes virtual Total column', () => {
    const rows = [mkRow({ values: [500, 500, 0], entityName: 'X', metricLabel: 'Y' })]
    const m = buildMatchList(rows, monthsLen, '1000')
    // total = 1000 → col = monthsLen (3)
    expect(m).toEqual([{ row: 0, col: 3, hitKind: 'amount' }])
  })

  it('amount hit suppresses row-level entity/metric match on same row', () => {
    const rows = [
      mkRow({ entityName: '1000 Loan', metricLabel: 'X', values: [1000, 500, 0] }),
    ]
    const m = buildMatchList(rows, monthsLen, '1000')
    // Cell hits for col 0 (1000) and total col (1500 — no, 1500 doesn't match).
    // Row total = 1500 — doesn't match 1000 w/ tol 1. So only col 0.
    // Row-level entity match on '1000 Loan' is SUPPRESSED because col 0 hit.
    expect(m).toEqual([{ row: 0, col: 0, hitKind: 'amount' }])
  })

  it('case-insensitive entity match', () => {
    const rows = [mkRow({ entityName: 'ACME Holdings', values: [0, 0, 0] })]
    expect(buildMatchList(rows, monthsLen, 'acme')).toHaveLength(1)
  })

  it('emits matches top-to-bottom, left-to-right', () => {
    const rows = [
      mkRow({ entityName: 'Row0', metricLabel: 'M', values: [1000, 1000, 0] }),
      mkRow({ entityName: 'Row1', metricLabel: 'M', values: [0, 0, 1000] }),
    ]
    const m = buildMatchList(rows, monthsLen, '1000')
    // row0 totals = 2000 (no match). row1 total = 1000 → col 3 matches.
    expect(m.map((x) => [x.row, x.col])).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [1, 3],
    ])
  })
})

describe('cursor helpers', () => {
  it('next wraps', () => {
    expect(nextMatchIndex(null, 3)).toBe(0)
    expect(nextMatchIndex(2, 3)).toBe(0)
    expect(nextMatchIndex(0, 3)).toBe(1)
    expect(nextMatchIndex(null, 0)).toBe(0)
  })
  it('prev wraps', () => {
    expect(prevMatchIndex(null, 3)).toBe(2)
    expect(prevMatchIndex(0, 3)).toBe(2)
    expect(prevMatchIndex(1, 3)).toBe(0)
  })
})

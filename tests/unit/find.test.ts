import { describe, it, expect } from 'vitest'
import {
  buildMatchList,
  nextMatchIndex,
  prevMatchIndex,
  normaliseAmountQuery,
  type FindMatch,
} from '@/lib/forecast/find'
import type { FlatRow } from '@/lib/forecast/flat-rows'
import type { ForecastLine, Period } from '@/lib/types'
import { mkForecastLine, mkPeriod } from './helpers/forecast-fixtures'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkLine(
  id: string,
  periodId: string,
  amount: number,
  opts: {
    counterparty?: string | null
    notes?: string | null
    source?: ForecastLine['source']
  } = {},
): ForecastLine {
  return mkForecastLine({
    id,
    entityId: 'e1',
    categoryId: 'cat1',
    periodId,
    amount,
    source: opts.source ?? 'manual',
    counterparty: opts.counterparty ?? null,
    notes: opts.notes ?? null,
  })
}

function mkItemRow(
  rowIdx: number,
  lines: ForecastLine[],
): FlatRow & { kind: 'item' } {
  const lineByPeriod = new Map(lines.map((l) => [l.periodId, l]))
  return {
    kind: 'item',
    sectionId: 'sec1',
    itemKey: `key_${rowIdx}`,
    lineIds: lines.map((l) => l.id),
    lineByPeriod,
    isPipeline: false,
  }
}

const periods: Period[] = [mkPeriod(0), mkPeriod(1), mkPeriod(2)]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildMatchList', () => {
  it('1. empty query → no matches', () => {
    const line = mkLine('l1', 'p0', 1000, { counterparty: 'Acme' })
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: '' })
    expect(result).toHaveLength(0)
  })

  it('2. counterparty substring hit (case-insensitive) → col: null, hitKind: counterparty', () => {
    const line = mkLine('l1', 'p0', 0, { counterparty: 'Acme Corp' })
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: 'acme' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject<Partial<FindMatch>>({
      row: 0,
      col: null,
      hitKind: 'counterparty',
    })
  })

  it('3. notes substring hit → col: null, hitKind: notes', () => {
    const line = mkLine('l1', 'p0', 0, { notes: 'Invoice #42' })
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: 'invoice' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject<Partial<FindMatch>>({
      row: 0,
      col: null,
      hitKind: 'notes',
    })
  })

  it('4. amount numeric-equality hit — "1500" matches amount: 1500 → col=period index, hitKind: amount', () => {
    const line = mkLine('l1', 'p1', 1500)
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: '1500' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject<Partial<FindMatch>>({
      row: 0,
      col: 1, // p1 is the second period (index 1)
      hitKind: 'amount',
      lineId: 'l1',
    })
  })

  it('5a. amount formatted-substring hit — "$1,500" matches amount: 1500', () => {
    const line = mkLine('l1', 'p0', 1500)
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: '$1,500' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ col: 0, hitKind: 'amount' })
  })

  it('5b. amount stripped-form hit — "1,500" matches amount: 1500 (via numeric equality)', () => {
    const line = mkLine('l1', 'p0', 1500)
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: '1,500' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ col: 0, hitKind: 'amount' })
  })

  it('6. amount hit with parens — "(500)" matches amount: -500', () => {
    const line = mkLine('l1', 'p0', -500)
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: '(500)' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ col: 0, hitKind: 'amount' })
  })

  it('7. match ordering — two rows emit matches in top-down order', () => {
    const lineA = mkLine('lA', 'p0', 2000, { counterparty: 'Alpha' })
    const lineB = mkLine('lB', 'p0', 2000, { counterparty: 'Beta' })
    const flatRows: FlatRow[] = [
      mkItemRow(0, [lineA]),
      mkItemRow(1, [lineB]),
    ]
    // Both have amount 2000 — should produce matches in row order.
    const result = buildMatchList({
      flatRows,
      periods,
      query: '2000',
    })
    expect(result).toHaveLength(2)
    expect(result[0]!.row).toBe(0)
    expect(result[1]!.row).toBe(1)
  })

  it('8. row-level match NOT emitted when any cell-level match exists on the same row', () => {
    // The counterparty contains "acme" AND an amount cell matches "1500".
    // Only the cell-level match should be emitted.
    const line = mkLine('l1', 'p0', 1500, { counterparty: 'Acme Corp' })
    const flatRows: FlatRow[] = [mkItemRow(0, [line])]
    const result = buildMatchList({ flatRows, periods, query: '1500' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ col: 0, hitKind: 'amount' })
    // No row-level (col: null) match should appear.
    expect(result.some((m) => m.col === null)).toBe(false)
  })
})

// ── nextMatchIndex ────────────────────────────────────────────────────────────

describe('nextMatchIndex', () => {
  it('9a. null → 0 (first match)', () => {
    expect(nextMatchIndex(null, 3)).toBe(0)
  })

  it('9b. last → 0 (wraps around)', () => {
    expect(nextMatchIndex(2, 3)).toBe(0)
  })

  it('9c. mid → mid+1', () => {
    expect(nextMatchIndex(1, 3)).toBe(2)
  })

  it('9d. empty list (total=0) → 0 (documented contract: caller must guard against empty list)', () => {
    // When total === 0 both functions return 0. Callers are responsible for
    // checking that the match list is non-empty before using the index.
    expect(nextMatchIndex(null, 0)).toBe(0)
    expect(nextMatchIndex(0, 0)).toBe(0)
  })
})

// ── prevMatchIndex ────────────────────────────────────────────────────────────

describe('prevMatchIndex', () => {
  it('10a. null → last', () => {
    expect(prevMatchIndex(null, 3)).toBe(2)
  })

  it('10b. 0 → last (wraps around)', () => {
    expect(prevMatchIndex(0, 3)).toBe(2)
  })

  it('10c. mid → mid-1', () => {
    expect(prevMatchIndex(2, 3)).toBe(1)
  })

  it('10d. empty list (total=0) → 0 (documented contract: caller must guard against empty list)', () => {
    expect(prevMatchIndex(null, 0)).toBe(0)
    expect(prevMatchIndex(0, 0)).toBe(0)
  })
})

// ── normaliseAmountQuery ──────────────────────────────────────────────────────

describe('normaliseAmountQuery', () => {
  it('11a. "$1,500" → 1500', () => {
    expect(normaliseAmountQuery('$1,500')).toBe(1500)
  })

  it('11b. "(500)" → -500', () => {
    expect(normaliseAmountQuery('(500)')).toBe(-500)
  })

  it('11c. "abc" → null', () => {
    expect(normaliseAmountQuery('abc')).toBeNull()
  })

  it('11d. "" → null', () => {
    expect(normaliseAmountQuery('')).toBeNull()
  })

  it('11e. "1500" → 1500', () => {
    expect(normaliseAmountQuery('1500')).toBe(1500)
  })

  it('11f. "1,500" → 1500', () => {
    expect(normaliseAmountQuery('1,500')).toBe(1500)
  })

  it('11g. "  " (whitespace only) → null', () => {
    expect(normaliseAmountQuery('  ')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import {
  normalizeRange,
  cellsInRange,
  forEachCellInRange,
  isInRange,
  jumpToEdge,
  type Selection,
} from '@/lib/pipeline/summary-selection'
import { buildFlatSummaryRows } from '@/lib/pipeline/summary-flat-rows'
import type { BUSummaryRow } from '@/lib/pipeline/types'

// ---------------------------------------------------------------------------
// summary-selection
// ---------------------------------------------------------------------------

function sel(ar: number, ac: number, fr: number, fc: number): Selection {
  return { anchor: { row: ar, col: ac }, focus: { row: fr, col: fc } }
}

describe('normalizeRange', () => {
  it('normalises a single cell', () => {
    expect(normalizeRange(sel(2, 3, 2, 3))).toEqual({
      rowStart: 2, rowEnd: 2, colStart: 3, colEnd: 3,
    })
  })
  it('normalises a reversed (up-left drag) selection', () => {
    expect(normalizeRange(sel(5, 7, 2, 3))).toEqual({
      rowStart: 2, rowEnd: 5, colStart: 3, colEnd: 7,
    })
  })
  it('normalises a single-row selection', () => {
    expect(normalizeRange(sel(4, 1, 4, 6))).toEqual({
      rowStart: 4, rowEnd: 4, colStart: 1, colEnd: 6,
    })
  })
  it('normalises a single-col selection', () => {
    expect(normalizeRange(sel(1, 2, 6, 2))).toEqual({
      rowStart: 1, rowEnd: 6, colStart: 2, colEnd: 2,
    })
  })
})

describe('cellsInRange', () => {
  it('single cell returns 1 element', () => {
    expect(cellsInRange(sel(0, 0, 0, 0))).toEqual([{ row: 0, col: 0 }])
  })
  it('single row', () => {
    expect(cellsInRange(sel(3, 1, 3, 3))).toEqual([
      { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 },
    ])
  })
  it('single col', () => {
    expect(cellsInRange(sel(1, 5, 3, 5))).toEqual([
      { row: 1, col: 5 }, { row: 2, col: 5 }, { row: 3, col: 5 },
    ])
  })
  it('multi-row × multi-col (row-major)', () => {
    expect(cellsInRange(sel(1, 1, 2, 2))).toEqual([
      { row: 1, col: 1 }, { row: 1, col: 2 },
      { row: 2, col: 1 }, { row: 2, col: 2 },
    ])
  })
})

describe('forEachCellInRange', () => {
  it('emits (row, col, isTotalCol) for a 2×3 selection including the Total col', () => {
    // months.length = 3, so col 3 is Total. Selection spans cols 2..3 (= month 2 + Total), rows 0..1.
    const visited: Array<[number, number, boolean]> = []
    forEachCellInRange(sel(0, 2, 1, 3), 3, (row, col, isTotalCol) => {
      visited.push([row, col, isTotalCol])
    })
    expect(visited).toEqual([
      [0, 2, false], [0, 3, true],
      [1, 2, false], [1, 3, true],
    ])
  })
  it('never flags isTotalCol when selection is entirely in month columns', () => {
    const visited: Array<[number, number, boolean]> = []
    forEachCellInRange(sel(0, 0, 1, 1), 12, (row, col, isTotalCol) => {
      visited.push([row, col, isTotalCol])
    })
    expect(visited.every(([,, t]) => t === false)).toBe(true)
    expect(visited).toHaveLength(4)
  })
})

describe('isInRange', () => {
  it('includes endpoints', () => {
    const s = sel(1, 1, 3, 3)
    expect(isInRange(1, 1, s)).toBe(true)
    expect(isInRange(3, 3, s)).toBe(true)
    expect(isInRange(2, 2, s)).toBe(true)
  })
  it('excludes outside points', () => {
    const s = sel(1, 1, 3, 3)
    expect(isInRange(0, 1, s)).toBe(false)
    expect(isInRange(1, 0, s)).toBe(false)
    expect(isInRange(4, 3, s)).toBe(false)
    expect(isInRange(3, 4, s)).toBe(false)
  })
})

describe('jumpToEdge', () => {
  const rowCount = 10
  const colCount = 13 // 12 months + Total

  it('jumps right to last col (including virtual Total)', () => {
    expect(jumpToEdge('right', { row: 2, col: 3 }, rowCount, colCount))
      .toEqual({ row: 2, col: 12 })
  })
  it('jumps left to col 0', () => {
    expect(jumpToEdge('left', { row: 2, col: 8 }, rowCount, colCount))
      .toEqual({ row: 2, col: 0 })
  })
  it('jumps up to row 0', () => {
    expect(jumpToEdge('up', { row: 5, col: 4 }, rowCount, colCount))
      .toEqual({ row: 0, col: 4 })
  })
  it('jumps down to last row', () => {
    expect(jumpToEdge('down', { row: 5, col: 4 }, rowCount, colCount))
      .toEqual({ row: 9, col: 4 })
  })

  // Edge-jump from each corner
  it('from top-left: right → (0, last)', () => {
    expect(jumpToEdge('right', { row: 0, col: 0 }, rowCount, colCount))
      .toEqual({ row: 0, col: 12 })
  })
  it('from top-left: down → (last, 0)', () => {
    expect(jumpToEdge('down', { row: 0, col: 0 }, rowCount, colCount))
      .toEqual({ row: 9, col: 0 })
  })
  it('from top-right: left → (0, 0)', () => {
    expect(jumpToEdge('left', { row: 0, col: 12 }, rowCount, colCount))
      .toEqual({ row: 0, col: 0 })
  })
  it('from top-right: down → (last, last)', () => {
    expect(jumpToEdge('down', { row: 0, col: 12 }, rowCount, colCount))
      .toEqual({ row: 9, col: 12 })
  })
  it('from bottom-left: up → (0, 0)', () => {
    expect(jumpToEdge('up', { row: 9, col: 0 }, rowCount, colCount))
      .toEqual({ row: 0, col: 0 })
  })
  it('from bottom-left: right → (last, last)', () => {
    expect(jumpToEdge('right', { row: 9, col: 0 }, rowCount, colCount))
      .toEqual({ row: 9, col: 12 })
  })
  it('from bottom-right: up → (0, last)', () => {
    expect(jumpToEdge('up', { row: 9, col: 12 }, rowCount, colCount))
      .toEqual({ row: 0, col: 12 })
  })
  it('from bottom-right: left → (last, 0)', () => {
    expect(jumpToEdge('left', { row: 9, col: 12 }, rowCount, colCount))
      .toEqual({ row: 9, col: 0 })
  })

  it('clamps at 0 when rowCount is 0', () => {
    expect(jumpToEdge('down', { row: 0, col: 3 }, 0, colCount))
      .toEqual({ row: 0, col: 3 })
  })
})

// ---------------------------------------------------------------------------
// summary-flat-rows
// ---------------------------------------------------------------------------

function makeRow(id: string, name: string, base: number): BUSummaryRow {
  const arr = (v: number) => [v, v, v]
  return {
    entityId: id,
    entityName: name,
    confirmedAndAwaiting: arr(base),
    upcomingAndSpeculative: arr(base + 1),
    totalForecast: arr(base + 2),
    target: arr(base + 3),
    variance: arr(base + 4),
    pnlForecast: arr(base + 5),
  }
}

describe('buildFlatSummaryRows', () => {
  it('single entity, not collapsed → 6 metric rows, no group total', () => {
    const rows = [makeRow('e1', 'Entity 1', 10)]
    const flat = buildFlatSummaryRows(rows, {})
    expect(flat).toHaveLength(6)
    expect(flat.map((r) => r.metricKey)).toEqual([
      'confirmedAndAwaiting', 'upcomingAndSpeculative', 'totalForecast',
      'target', 'variance', 'pnlForecast',
    ])
    expect(flat[0]!.entityId).toBe('e1')
    expect(flat[0]!.kind).toBe('entity-metric')
    expect(flat[0]!.values).toEqual([10, 10, 10])
  })

  it('two entities → 6 + 6 + 6 group-total rows', () => {
    const rows = [makeRow('e1', 'E1', 10), makeRow('e2', 'E2', 20)]
    const flat = buildFlatSummaryRows(rows, {})
    expect(flat).toHaveLength(18)
    const groupTotals = flat.filter((r) => r.kind === 'group-total-metric')
    expect(groupTotals).toHaveLength(6)
    expect(groupTotals[0]!.entityId).toBeNull()
    // confirmedAndAwaiting: 10 + 20 = 30
    expect(groupTotals[0]!.values).toEqual([30, 30, 30])
    // Header-exclusion invariant: every flat row is a selectable metric row,
    // never an entity-header entry.
    expect(flat.every((r) => r.kind === 'entity-metric' || r.kind === 'group-total-metric')).toBe(true)
  })

  it('collapsed entities contribute zero rows', () => {
    const rows = [makeRow('e1', 'E1', 10), makeRow('e2', 'E2', 20)]
    const flat = buildFlatSummaryRows(rows, { e1: true })
    // e1 collapsed → 0 rows; e2 expanded → 6 rows; group-total → 6 rows
    expect(flat).toHaveLength(12)
    const e2Rows = flat.filter((r) => r.entityId === 'e2')
    expect(e2Rows).toHaveLength(6)
  })
})

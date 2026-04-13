import { describe, it, expect } from 'vitest'
import {
  toRange,
  sizeOf,
  iterateRange,
  isInRange,
  extendSelection,
  collapseTo,
  extendByArrow,
  jumpToEdge,
  type Selection,
} from '@/lib/forecast/selection'
import type { FlatRow } from '@/lib/forecast/flat-rows'
import type { ForecastLine } from '@/lib/types'

// Minimal ForecastLine factory for tests — fills only the fields jumpToEdge needs.
const minLine = (periodId: string, amount: number): ForecastLine =>
  ({
    id: `line-${periodId}`,
    entityId: 'e1',
    categoryId: 'cat-1',
    periodId,
    amount,
    confidence: 1,
    source: 'manual',
    counterparty: null,
    notes: null,
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'none',
  }) as ForecastLine

const cell = (row: number, col: number) => ({ row, col })

describe('selection / toRange', () => {
  it('normalises anchor top-left, focus bottom-right', () => {
    const sel: Selection = { anchor: cell(1, 2), focus: cell(4, 5) }
    expect(toRange(sel)).toEqual({ rowStart: 1, rowEnd: 4, colStart: 2, colEnd: 5 })
  })

  it('normalises anchor bottom-right, focus top-left (reversed)', () => {
    const sel: Selection = { anchor: cell(4, 5), focus: cell(1, 2) }
    expect(toRange(sel)).toEqual({ rowStart: 1, rowEnd: 4, colStart: 2, colEnd: 5 })
  })

  it('handles mixed axes (anchor top-right, focus bottom-left)', () => {
    const sel: Selection = { anchor: cell(1, 5), focus: cell(4, 2) }
    expect(toRange(sel)).toEqual({ rowStart: 1, rowEnd: 4, colStart: 2, colEnd: 5 })
  })

  it('handles a single-cell selection', () => {
    const sel: Selection = { anchor: cell(3, 3), focus: cell(3, 3) }
    expect(toRange(sel)).toEqual({ rowStart: 3, rowEnd: 3, colStart: 3, colEnd: 3 })
  })
})

describe('selection / sizeOf', () => {
  it('returns {1,1} for a single cell', () => {
    expect(sizeOf({ rowStart: 2, rowEnd: 2, colStart: 4, colEnd: 4 })).toEqual({ rows: 1, cols: 1 })
  })

  it('returns {3,5} for a 3x5 block', () => {
    expect(sizeOf({ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 4 })).toEqual({ rows: 3, cols: 5 })
  })
})

describe('selection / iterateRange', () => {
  it('walks all cells row-major', () => {
    const cells = Array.from(iterateRange({ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 2 }))
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ])
  })

  it('yields one cell for a 1x1 range', () => {
    const cells = Array.from(iterateRange({ rowStart: 3, rowEnd: 3, colStart: 7, colEnd: 7 }))
    expect(cells).toEqual([{ row: 3, col: 7 }])
  })
})

describe('selection / isInRange', () => {
  const range = { rowStart: 2, rowEnd: 5, colStart: 3, colEnd: 6 }

  it('inclusive at all four corners', () => {
    expect(isInRange(range, 2, 3)).toBe(true)
    expect(isInRange(range, 5, 6)).toBe(true)
    expect(isInRange(range, 2, 6)).toBe(true)
    expect(isInRange(range, 5, 3)).toBe(true)
  })

  it('returns false for out-of-bounds cells', () => {
    expect(isInRange(range, 1, 4)).toBe(false)
    expect(isInRange(range, 6, 4)).toBe(false)
    expect(isInRange(range, 3, 2)).toBe(false)
    expect(isInRange(range, 3, 7)).toBe(false)
  })
})

describe('selection / extendSelection', () => {
  it('keeps the anchor and updates focus', () => {
    const sel: Selection = { anchor: cell(1, 1), focus: cell(2, 2) }
    const extended = extendSelection(sel, cell(5, 7))
    expect(extended.anchor).toEqual({ row: 1, col: 1 })
    expect(extended.focus).toEqual({ row: 5, col: 7 })
  })

  it('preserves anchor under multiple extensions', () => {
    const sel: Selection = { anchor: cell(2, 3), focus: cell(2, 3) }
    const a = extendSelection(sel, cell(4, 5))
    const b = extendSelection(a, cell(6, 1))
    const c = extendSelection(b, cell(0, 0))
    expect(c.anchor).toEqual({ row: 2, col: 3 })
    expect(c.focus).toEqual({ row: 0, col: 0 })
  })
})

describe('selection / collapseTo', () => {
  it('creates a selection where anchor === focus', () => {
    const sel = collapseTo(cell(4, 7))
    expect(sel.anchor).toEqual({ row: 4, col: 7 })
    expect(sel.focus).toEqual({ row: 4, col: 7 })
  })
})

describe('selection / extendByArrow', () => {
  const allFocusable = () => true

  it('right: {r:2,c:3} → {r:2,c:4}', () => {
    const sel: Selection = { anchor: cell(2, 3), focus: cell(2, 3) }
    const out = extendByArrow(sel, 'right', 10, 10, allFocusable)
    expect(out.focus).toEqual({ row: 2, col: 4 })
    expect(out.anchor).toEqual({ row: 2, col: 3 })
  })

  it('left: {r:2,c:3} → {r:2,c:2}', () => {
    const sel: Selection = { anchor: cell(2, 3), focus: cell(2, 3) }
    const out = extendByArrow(sel, 'left', 10, 10, allFocusable)
    expect(out.focus).toEqual({ row: 2, col: 2 })
  })

  it('down: skips unfocusable rows', () => {
    // Rows 0,1 focusable; row 2 NOT; row 3 focusable.
    const isFocusable = (r: number) => r !== 2
    const sel: Selection = { anchor: cell(1, 4), focus: cell(1, 4) }
    const out = extendByArrow(sel, 'down', 10, 10, isFocusable)
    expect(out.focus).toEqual({ row: 3, col: 4 })
    expect(out.anchor).toEqual({ row: 1, col: 4 })
  })

  it('up: skips unfocusable rows', () => {
    const isFocusable = (r: number) => r !== 4
    const sel: Selection = { anchor: cell(5, 2), focus: cell(5, 2) }
    const out = extendByArrow(sel, 'up', 10, 10, isFocusable)
    expect(out.focus).toEqual({ row: 3, col: 2 })
  })

  it('clamped at rowMax: down → no-op', () => {
    const sel: Selection = { anchor: cell(10, 2), focus: cell(10, 2) }
    const out = extendByArrow(sel, 'down', 10, 10, allFocusable)
    expect(out).toEqual(sel)
  })

  it('left at col 0 → no-op', () => {
    const sel: Selection = { anchor: cell(3, 0), focus: cell(3, 0) }
    const out = extendByArrow(sel, 'left', 10, 10, allFocusable)
    expect(out).toEqual(sel)
  })

  it('right at colMax → no-op', () => {
    const sel: Selection = { anchor: cell(3, 10), focus: cell(3, 10) }
    const out = extendByArrow(sel, 'right', 10, 10, allFocusable)
    expect(out).toEqual(sel)
  })

  it('up at row 0 → no-op', () => {
    const sel: Selection = { anchor: cell(0, 2), focus: cell(0, 2) }
    const out = extendByArrow(sel, 'up', 10, 10, allFocusable)
    expect(out).toEqual(sel)
  })

  it('down with no focusable row below → no-op', () => {
    // Only row 2 focusable; asking to move down from row 2 should find none.
    const isFocusable = (r: number) => r === 2
    const sel: Selection = { anchor: cell(2, 1), focus: cell(2, 1) }
    const out = extendByArrow(sel, 'down', 5, 10, isFocusable)
    expect(out).toEqual(sel)
  })

  it('anchor preserved under multiple arrow extensions', () => {
    const sel: Selection = { anchor: cell(2, 2), focus: cell(2, 2) }
    const a = extendByArrow(sel, 'right', 10, 10, allFocusable)
    const b = extendByArrow(a, 'right', 10, 10, allFocusable)
    const c = extendByArrow(b, 'down', 10, 10, allFocusable)
    expect(c.anchor).toEqual({ row: 2, col: 2 })
    expect(c.focus).toEqual({ row: 3, col: 4 })
  })

  it('extending then collapsing returns to single-cell at the collapse point', () => {
    const sel: Selection = { anchor: cell(1, 1), focus: cell(1, 1) }
    const extended = extendByArrow(sel, 'right', 10, 10, allFocusable)
    const collapsed = collapseTo(extended.focus)
    expect(collapsed.anchor).toEqual(collapsed.focus)
    expect(collapsed.anchor).toEqual({ row: 1, col: 2 })
  })
})

// ── jumpToEdge helpers ────────────────────────────────────────────────────────

/** Build a minimal item FlatRow with the given amounts per period index. */
function makeItemRow(
  amounts: number[],
  periods: Array<{ id: string }>,
): FlatRow & { kind: 'item' } {
  const lineByPeriod = new Map<string, ForecastLine>()
  for (let i = 0; i < amounts.length; i++) {
    const p = periods[i]
    if (!p) continue
    if (amounts[i] !== 0) {
      lineByPeriod.set(p.id, minLine(p.id, amounts[i]!))
    }
  }
  return {
    kind: 'item',
    sectionId: 'sec-1',
    itemKey: 'cat-1::Item',
    lineIds: [],
    lineByPeriod,
    isPipeline: false,
  }
}

/** Minimal non-focusable rows. */
const headerRow: FlatRow = { kind: 'sectionHeader', sectionId: 'sec-1' }
const subtotalRowNonEditable: FlatRow = {
  kind: 'subtotal',
  sectionId: 'sec-1',
  subId: 'sub-1',
  subCategoryIds: ['cat-1'],
  editable: false,
}

describe('selection / jumpToEdge', () => {
  // 5-period grid: amounts [0, 100, 200, 300, 0]
  const periods5 = [
    { id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' },
  ]

  it('1. arrow-right from non-zero, next also non-zero, then zeros → jumps to end of non-zero run', () => {
    // col layout: [0]=0, [1]=100, [2]=200, [3]=300, [4]=0
    // Start at col 1 (non-zero). Run ends at col 3. col 4 is zero.
    const row = makeItemRow([0, 100, 200, 300, 0], periods5)
    const flat: FlatRow[] = [row]
    const result = jumpToEdge(0, 1, 'right', flat, periods5)
    expect(result).toEqual({ row: 0, col: 3 })
  })

  it('2. arrow-right from non-zero, very next cell is zero → no-op', () => {
    // col layout: [0]=100, [1]=0, [2]=200, [3]=300, [4]=0
    // Start at col 0 (non-zero). Next is col 1 (zero) → stay at col 0.
    const row = makeItemRow([100, 0, 200, 300, 0], periods5)
    const flat: FlatRow[] = [row]
    const result = jumpToEdge(0, 0, 'right', flat, periods5)
    expect(result).toEqual({ row: 0, col: 0 })
  })

  it('3. arrow-right from zero, first non-zero is 3 columns away → jumps there', () => {
    // col layout: [0]=0, [1]=0, [2]=0, [3]=500, [4]=0
    // Start at col 0. First non-zero going right is col 3.
    const row = makeItemRow([0, 0, 0, 500, 0], periods5)
    const flat: FlatRow[] = [row]
    const result = jumpToEdge(0, 0, 'right', flat, periods5)
    expect(result).toEqual({ row: 0, col: 3 })
  })

  it('4. arrow-right from zero, all cells to right are zero → jumps to last column', () => {
    const row = makeItemRow([0, 0, 0, 0, 0], periods5)
    const flat: FlatRow[] = [row]
    const result = jumpToEdge(0, 0, 'right', flat, periods5)
    expect(result).toEqual({ row: 0, col: 4 }) // grid edge
  })

  it('5a. arrow-left from non-zero, prev cells non-zero, then zero → jumps to start of run', () => {
    // col layout: [0]=0, [1]=100, [2]=200, [3]=300, [4]=0
    // Start at col 3. Walk left: col 2 non-zero, col 1 non-zero, col 0 is zero → stop at 1.
    const row = makeItemRow([0, 100, 200, 300, 0], periods5)
    const flat: FlatRow[] = [row]
    const result = jumpToEdge(0, 3, 'left', flat, periods5)
    expect(result).toEqual({ row: 0, col: 1 })
  })

  it('5b. arrow-left from zero, first non-zero to the left → jumps there', () => {
    // col layout: [0]=0, [1]=0, [2]=100, [3]=0, [4]=0
    // Start at col 4 (zero). First non-zero going left is col 2.
    const row = makeItemRow([0, 0, 100, 0, 0], periods5)
    const flat: FlatRow[] = [row]
    const result = jumpToEdge(0, 4, 'left', flat, periods5)
    expect(result).toEqual({ row: 0, col: 2 })
  })

  it('6. arrow-down from non-zero item, skips non-focusable subtotal, reaches another non-zero → jumps past subtotal', () => {
    // rows: [0] item(100), [1] non-editable subtotal (non-focusable), [2] item(200)
    // Start at row 0 (non-zero). Next focusable is row 2 (non-zero) → stops at row 2.
    const row0 = makeItemRow([100], [periods5[0]!])
    const row2 = makeItemRow([200], [periods5[0]!])
    const flat: FlatRow[] = [row0, subtotalRowNonEditable, row2]
    const periods1 = [periods5[0]!]
    const result = jumpToEdge(0, 0, 'down', flat, periods1)
    expect(result).toEqual({ row: 2, col: 0 })
  })

  it('7. arrow-up from row 0 → no-op (clamps at row 0)', () => {
    const row = makeItemRow([100, 200], periods5.slice(0, 2))
    const flat: FlatRow[] = [row]
    const result = jumpToEdge(0, 0, 'up', flat, periods5.slice(0, 2))
    expect(result).toEqual({ row: 0, col: 0 })
  })

  it('8. no focusable rows in the direction → clamps at grid edge, preserves column', () => {
    // Only row 0 is focusable. Arrow-down should return row 0 (no focusable below).
    const row0 = makeItemRow([100], [periods5[0]!])
    const flat: FlatRow[] = [row0, headerRow]
    const periods1 = [periods5[0]!]
    const result = jumpToEdge(0, 0, 'down', flat, periods1)
    // No focusable below, current is non-zero, next focusable doesn't exist → no-op
    expect(result).toEqual({ row: 0, col: 0 })
  })
})

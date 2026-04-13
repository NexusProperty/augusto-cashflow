import { describe, it, expect } from 'vitest'
import {
  toRange,
  sizeOf,
  iterateRange,
  isInRange,
  extendSelection,
  collapseTo,
  extendByArrow,
  type Selection,
} from '@/lib/forecast/selection'

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

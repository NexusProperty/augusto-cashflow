import { describe, it, expect } from 'vitest'
import {
  computeFillHandleRange,
  isInFillRange,
  detectPattern,
  materialisePattern,
  type FillHandleInput,
} from '@/lib/forecast/fill-handle'

/** Build a fixture with sensible defaults. */
function build(
  partial: Partial<FillHandleInput> & {
    source?: [number, number] | [number, number, number, number]
    mouse: [number, number]
  },
): FillHandleInput {
  const s = partial.source ?? [0, 0]
  const source =
    s.length === 2
      ? { rowStart: s[0], rowEnd: s[0], colStart: s[1], colEnd: s[1] }
      : { rowStart: s[0], rowEnd: s[1], colStart: s[2], colEnd: s[3] }
  return {
    sourceSelection: source,
    mouseCell: { row: partial.mouse[0], col: partial.mouse[1] },
    rowMax: partial.rowMax ?? 20,
    colMax: partial.colMax ?? 20,
  }
}

describe('computeFillHandleRange', () => {
  it('extends a single-cell source to the right', () => {
    const result = computeFillHandleRange(build({ source: [2, 3], mouse: [2, 5] }))
    expect(result.previewRange).toEqual({ rowStart: 2, rowEnd: 2, colStart: 3, colEnd: 5 })
    expect(result.targetCells).toEqual([
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ])
  })

  it('extends a single-cell source downward', () => {
    const result = computeFillHandleRange(build({ source: [2, 3], mouse: [4, 3] }))
    expect(result.previewRange).toEqual({ rowStart: 2, rowEnd: 4, colStart: 3, colEnd: 3 })
    expect(result.targetCells).toEqual([
      { row: 3, col: 3 },
      { row: 4, col: 3 },
    ])
  })

  it('extends a single-cell source diagonally (down + right)', () => {
    const result = computeFillHandleRange(build({ source: [2, 3], mouse: [4, 5] }))
    expect(result.previewRange).toEqual({ rowStart: 2, rowEnd: 4, colStart: 3, colEnd: 5 })
    // 3x3 rectangle, minus the (2,3) source cell → 8 targets, row-major
    expect(result.targetCells).toEqual([
      { row: 2, col: 4 },
      { row: 2, col: 5 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 3, col: 5 },
      { row: 4, col: 3 },
      { row: 4, col: 4 },
      { row: 4, col: 5 },
    ])
  })

  it('extends a multi-cell source to the right preserving both source rows', () => {
    const result = computeFillHandleRange(
      build({ source: [1, 2, 1, 2], mouse: [1, 5] }),
    )
    expect(result.previewRange).toEqual({ rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 5 })
    expect(result.targetCells).toEqual([
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 1, col: 5 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ])
  })

  it('ignores mouse up-left of source — preview equals source, no targets', () => {
    const result = computeFillHandleRange(build({ source: [2, 3], mouse: [0, 0] }))
    expect(result.previewRange).toEqual({ rowStart: 2, rowEnd: 2, colStart: 3, colEnd: 3 })
    expect(result.targetCells).toEqual([])
  })

  it('ignores mouse upward from single-cell source', () => {
    const result = computeFillHandleRange(build({ source: [5, 5], mouse: [2, 5] }))
    expect(result.previewRange).toEqual({ rowStart: 5, rowEnd: 5, colStart: 5, colEnd: 5 })
    expect(result.targetCells).toEqual([])
  })

  it('ignores mouse leftward from single-cell source', () => {
    const result = computeFillHandleRange(build({ source: [5, 5], mouse: [5, 2] }))
    expect(result.previewRange).toEqual({ rowStart: 5, rowEnd: 5, colStart: 5, colEnd: 5 })
    expect(result.targetCells).toEqual([])
  })

  it('ignores mouse inside the source range (no growth)', () => {
    const result = computeFillHandleRange(
      build({ source: [1, 3, 1, 3], mouse: [2, 2] }),
    )
    expect(result.previewRange).toEqual({ rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 3 })
    expect(result.targetCells).toEqual([])
  })

  it('clamps mouse row beyond rowMax to rowMax', () => {
    const result = computeFillHandleRange(
      build({ source: [0, 0], mouse: [99, 0], rowMax: 4, colMax: 4 }),
    )
    expect(result.previewRange).toEqual({ rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 0 })
    expect(result.targetCells).toEqual([
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
      { row: 4, col: 0 },
    ])
  })

  it('clamps mouse col beyond colMax to colMax', () => {
    const result = computeFillHandleRange(
      build({ source: [0, 0], mouse: [0, 99], rowMax: 4, colMax: 4 }),
    )
    expect(result.previewRange).toEqual({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 4 })
    expect(result.targetCells).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
    ])
  })

  it('mouse exactly at bottom-right of source → no extension, no targets', () => {
    const result = computeFillHandleRange(
      build({ source: [1, 3, 2, 4], mouse: [3, 4] }),
    )
    expect(result.previewRange).toEqual({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 })
    expect(result.targetCells).toEqual([])
  })

  it('mouse below and right of multi-cell source — 2D extension', () => {
    const result = computeFillHandleRange(
      build({ source: [0, 1, 0, 1], mouse: [2, 3] }),
    )
    expect(result.previewRange).toEqual({ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 3 })
    // 3x4 = 12 cells, minus source 2x2 = 4 → 8 new targets
    expect(result.targetCells).toEqual([
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
    ])
  })

  it('negative mouse coords clamp to zero and collapse to source', () => {
    const result = computeFillHandleRange(
      build({ source: [3, 3], mouse: [-5, -5] }),
    )
    expect(result.previewRange).toEqual({ rowStart: 3, rowEnd: 3, colStart: 3, colEnd: 3 })
    expect(result.targetCells).toEqual([])
  })

  it('mouse on same row to the left but same col as source end — no growth', () => {
    const result = computeFillHandleRange(build({ source: [2, 5], mouse: [2, 1] }))
    expect(result.previewRange).toEqual({ rowStart: 2, rowEnd: 2, colStart: 5, colEnd: 5 })
    expect(result.targetCells).toEqual([])
  })
})

describe('detectPattern', () => {
  it('single cell → constant with that cells value', () => {
    const result = detectPattern([{ row: 0, col: 0, amount: 42 }])
    expect(result).toEqual({ type: 'constant', value: 42 })
  })

  it('empty source → constant with value 0', () => {
    const result = detectPattern([])
    expect(result).toEqual({ type: 'constant', value: 0 })
  })

  it('2 cells in a row with constant delta → series (axis=col)', () => {
    const result = detectPattern([
      { row: 0, col: 0, amount: 100 },
      { row: 0, col: 1, amount: 110 },
    ])
    expect(result).toEqual({ type: 'series', start: 110, delta: 10, axis: 'col' })
  })

  it('2 cells in a column with constant delta → series (axis=row)', () => {
    const result = detectPattern([
      { row: 0, col: 3, amount: 200 },
      { row: 1, col: 3, amount: 250 },
    ])
    expect(result).toEqual({ type: 'series', start: 250, delta: 50, axis: 'row' })
  })

  it('3 cells with mixed deltas → constant (fallback to last value)', () => {
    const result = detectPattern([
      { row: 0, col: 0, amount: 100 },
      { row: 0, col: 1, amount: 110 },
      { row: 0, col: 2, amount: 125 },
    ])
    expect(result).toEqual({ type: 'constant', value: 125 })
  })

  it('2D source (2 rows × 2 cols) → constant', () => {
    const result = detectPattern([
      { row: 0, col: 0, amount: 100 },
      { row: 0, col: 1, amount: 110 },
      { row: 1, col: 0, amount: 200 },
      { row: 1, col: 1, amount: 210 },
    ])
    expect(result).toEqual({ type: 'constant', value: 210 })
  })

  it('negative delta (100, 90, 80) → series (axis=col), delta=-10', () => {
    const result = detectPattern([
      { row: 0, col: 0, amount: 100 },
      { row: 0, col: 1, amount: 90 },
      { row: 0, col: 2, amount: 80 },
    ])
    expect(result).toEqual({ type: 'series', start: 80, delta: -10, axis: 'col' })
  })
})

describe('materialisePattern', () => {
  it('constant pattern of value 42, n=5 → [42,42,42,42,42]', () => {
    expect(materialisePattern({ type: 'constant', value: 42 }, 5)).toEqual([42, 42, 42, 42, 42])
  })

  it('series start=100 delta=10 n=3 → [110,120,130] — picks up AFTER the last source value', () => {
    // start=100 represents the last source cell's value; first output is 100+10=110
    expect(materialisePattern({ type: 'series', start: 100, delta: 10, axis: 'col' }, 3)).toEqual([
      110, 120, 130,
    ])
  })

  it('n=0 → []', () => {
    expect(materialisePattern({ type: 'constant', value: 99 }, 0)).toEqual([])
    expect(materialisePattern({ type: 'series', start: 0, delta: 5, axis: 'row' }, 0)).toEqual([])
  })

  it('integration: detectPattern 2-cell series + materialisePattern(3) → [120,130,140]', () => {
    // Source: [100, 110]. Pattern start = last source = 110, delta = 10.
    // First output = 110+10 = 120.
    const pattern = detectPattern([
      { row: 0, col: 0, amount: 100 },
      { row: 0, col: 1, amount: 110 },
    ])
    expect(materialisePattern(pattern, 3)).toEqual([120, 130, 140])
  })
})

describe('isInFillRange', () => {
  it('returns true for cells inside range', () => {
    expect(isInFillRange({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 }, 2, 3)).toBe(true)
  })

  it('returns true for cells on the range boundary', () => {
    expect(isInFillRange({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 }, 1, 2)).toBe(true)
    expect(isInFillRange({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 }, 3, 4)).toBe(true)
  })

  it('returns false for cells outside range', () => {
    expect(isInFillRange({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 }, 0, 3)).toBe(false)
    expect(isInFillRange({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 }, 4, 3)).toBe(false)
    expect(isInFillRange({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 }, 2, 1)).toBe(false)
    expect(isInFillRange({ rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 }, 2, 5)).toBe(false)
  })
})

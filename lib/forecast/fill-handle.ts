/**
 * Pure helpers for the Excel-style fill-handle on the forecast grid.
 *
 * MVP semantics:
 *   - Smart fill: constant repeat or linear series extrapolation (see detectPattern).
 *   - Fill direction: DOWN and/or RIGHT only. Dragging up or left clamps back
 *     to the source edge (no-op extension).
 *   - The preview range always starts at the source's top-left corner and
 *     extends to `mouseCell` — clamped to the grid bounds and to "never shrink
 *     past the source" so the preview is a superset of the source.
 *   - `targetCells` is the row-major list of cells that would receive the
 *     fill value (i.e. every cell in the preview range that is NOT already
 *     in the source range).
 *
 * This module is deliberately JSX-free so it's trivially unit-testable.
 */

/**
 * A fill pattern detected from a source cell selection.
 *
 * - `constant`: repeat a single value into every target cell.
 * - `series`: extrapolate a linear arithmetic sequence along one axis.
 */
export type Pattern =
  | { type: 'constant'; value: number }
  | { type: 'series'; start: number; delta: number; axis: 'row' | 'col' }

/** Tolerance for treating adjacent deltas as equal when detecting a series. */
const DELTA_TOLERANCE = 0.01

/**
 * Detect whether a 1-D sorted list of cells forms a linear arithmetic series.
 *
 * Returns a Pattern describing the source cells. Fallback is always `constant`
 * using the last cell's amount (or 0 when the source is empty).
 *
 * @remarks
 * Precondition: each input cell has a unique `(row, col)` pair. Callers
 * derived from a rectangular grid walk (e.g. `computeFillHandleRange`'s source
 * iteration) satisfy this naturally. Behaviour with duplicate coordinates is
 * unspecified.
 */
export function detectPattern(
  cells: Array<{ row: number; col: number; amount: number }>,
): Pattern {
  // Fewer than 2 cells can't form a series.
  if (cells.length < 2) {
    return { type: 'constant', value: cells[0]?.amount ?? 0 }
  }

  // All cells must span exactly one row OR exactly one column.
  const rows = new Set(cells.map((c) => c.row))
  const cols = new Set(cells.map((c) => c.col))
  const singleRow = rows.size === 1
  const singleCol = cols.size === 1

  if (!singleRow && !singleCol) {
    // 2-D selection — fall back to constant using bottom-right-most value.
    return { type: 'constant', value: cells[cells.length - 1]!.amount }
  }

  const axis: 'row' | 'col' = singleRow ? 'col' : 'row'

  // Sort along the varying axis so deltas are computed in order.
  const sorted = [...cells].sort((a, b) =>
    axis === 'col' ? a.col - b.col : a.row - b.row,
  )

  const firstDelta = sorted[1]!.amount - sorted[0]!.amount
  for (let i = 1; i < sorted.length - 1; i++) {
    const d = sorted[i + 1]!.amount - sorted[i]!.amount
    if (Math.abs(d - firstDelta) > DELTA_TOLERANCE) {
      return { type: 'constant', value: sorted[sorted.length - 1]!.amount }
    }
  }

  // start = last source value; grid code picks up right after it.
  return { type: 'series', start: sorted[sorted.length - 1]!.amount, delta: firstDelta, axis }
}

/**
 * Materialise `n` fill values from a pattern.
 *
 * For a `series`, `pattern.start` is the LAST source cell's value (as stored by
 * `detectPattern`), so the first returned value is always `start + delta` — i.e.
 * the sequence picks up immediately after the last source cell.
 */
export function materialisePattern(pattern: Pattern, n: number): number[] {
  if (n <= 0) return []
  if (pattern.type === 'constant') {
    return Array(n).fill(pattern.value) as number[]
  }
  return Array.from({ length: n }, (_, i) => pattern.start + (i + 1) * pattern.delta)
}

export interface FillHandleInput {
  sourceSelection: {
    rowStart: number
    rowEnd: number
    colStart: number
    colEnd: number
  }
  mouseCell: { row: number; col: number }
  rowMax: number
  colMax: number
}

export interface FillHandleResult {
  previewRange: {
    rowStart: number
    rowEnd: number
    colStart: number
    colEnd: number
  }
  /** Cells OUTSIDE the source range, row-major. */
  targetCells: Array<{ row: number; col: number }>
}

/**
 * Compute the preview range and list of new target cells given a source
 * selection and the current mouse position.
 */
export function computeFillHandleRange(input: FillHandleInput): FillHandleResult {
  const { sourceSelection, mouseCell, rowMax, colMax } = input

  // Clamp the source to valid grid bounds defensively.
  const srcRowStart = Math.max(0, Math.min(sourceSelection.rowStart, rowMax))
  const srcRowEnd = Math.max(0, Math.min(sourceSelection.rowEnd, rowMax))
  const srcColStart = Math.max(0, Math.min(sourceSelection.colStart, colMax))
  const srcColEnd = Math.max(0, Math.min(sourceSelection.colEnd, colMax))

  // Clamp mouse to grid.
  const mouseRow = Math.max(0, Math.min(mouseCell.row, rowMax))
  const mouseCol = Math.max(0, Math.min(mouseCell.col, colMax))

  // Extension only grows down/right from the source. If the mouse is above or
  // left of the source's bottom-right corner, clamp to the source edge — the
  // preview is then equal to the source (targetCells empty).
  const previewRowEnd = Math.max(srcRowEnd, mouseRow)
  const previewColEnd = Math.max(srcColEnd, mouseCol)

  const previewRange = {
    rowStart: srcRowStart,
    rowEnd: previewRowEnd,
    colStart: srcColStart,
    colEnd: previewColEnd,
  }

  const targetCells: Array<{ row: number; col: number }> = []
  for (let row = previewRange.rowStart; row <= previewRange.rowEnd; row++) {
    for (let col = previewRange.colStart; col <= previewRange.colEnd; col++) {
      const inSource =
        row >= srcRowStart &&
        row <= srcRowEnd &&
        col >= srcColStart &&
        col <= srcColEnd
      if (!inSource) targetCells.push({ row, col })
    }
  }

  return { previewRange, targetCells }
}

/** True if (row, col) lies within the range. */
export function isInFillRange(
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
  row: number,
  col: number,
): boolean {
  return (
    row >= range.rowStart &&
    row <= range.rowEnd &&
    col >= range.colStart &&
    col <= range.colEnd
  )
}

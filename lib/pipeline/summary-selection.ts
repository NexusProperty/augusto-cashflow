/**
 * Pure helpers for rectangular multi-cell selection in the pipeline summary grid.
 *
 * Coordinates are (row, col) where `row` is an index into the flat summary
 * row list (see `buildFlatSummaryRows`) and `col` is 0..months.length-1 for
 * month cols, and `months.length` for the virtual Total column.
 *
 * Kept deliberately independent of `lib/forecast/selection.ts` — the two
 * pages intentionally stay decoupled.
 */

export interface CellRef {
  row: number
  col: number
}

export interface Selection {
  /** First cell clicked / shift-origin. Stable under extension. */
  anchor: CellRef
  /** Active / focused cell. Moves on extend. */
  focus: CellRef
}

export interface Range {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

/** Normalise a selection to a rectangular range (inclusive bounds). */
export function normalizeRange(selection: Selection): Range {
  const { anchor, focus } = selection
  return {
    rowStart: Math.min(anchor.row, focus.row),
    rowEnd: Math.max(anchor.row, focus.row),
    colStart: Math.min(anchor.col, focus.col),
    colEnd: Math.max(anchor.col, focus.col),
  }
}

/** Walk all cells in a selection, row-major. */
export function cellsInRange(selection: Selection): CellRef[] {
  const r = normalizeRange(selection)
  const out: CellRef[] = []
  for (let row = r.rowStart; row <= r.rowEnd; row++) {
    for (let col = r.colStart; col <= r.colEnd; col++) {
      out.push({ row, col })
    }
  }
  return out
}

/**
 * Iterates every cell in the selection rectangle, invoking the callback with
 * (row, col, isTotalCol) for each. The Total column lives at col === monthsLen
 * (the virtual column rendered after all month columns).
 */
export function forEachCellInRange(
  selection: Selection,
  monthsLen: number,
  visit: (row: number, col: number, isTotalCol: boolean) => void,
): void {
  const r = normalizeRange(selection)
  for (let row = r.rowStart; row <= r.rowEnd; row++) {
    for (let col = r.colStart; col <= r.colEnd; col++) {
      visit(row, col, col === monthsLen)
    }
  }
}

/** Inclusive point-in-range test. */
export function isInRange(row: number, col: number, selection: Selection): boolean {
  const r = normalizeRange(selection)
  return row >= r.rowStart && row <= r.rowEnd && col >= r.colStart && col <= r.colEnd
}

/**
 * Ctrl/Cmd+Arrow jump — clamp to the grid edges.
 *
 * Edge-clamp behavior: jumps to the first or last row/column on the specified
 * axis. Preserves the perpendicular coordinate (e.g., Ctrl+Up from (5, 3) →
 * (0, 3), not (0, 0)).
 *
 * This is a simple edge-clamp (no data-aware skipping), matching the spec
 * for Task 1. Later tasks may refine this with non-zero-run semantics.
 */
export function jumpToEdge(
  direction: 'up' | 'down' | 'left' | 'right',
  current: CellRef,
  rowCount: number,
  colCount: number,
): CellRef {
  switch (direction) {
    case 'up':
      return { row: 0, col: current.col }
    case 'down':
      return { row: Math.max(0, rowCount - 1), col: current.col }
    case 'left':
      return { row: current.row, col: 0 }
    case 'right':
      return { row: current.row, col: Math.max(0, colCount - 1) }
  }
}

/**
 * Pure helpers for rectangular multi-cell selection in the forecast grid.
 * Extracted to a .ts module (no JSX) so it can be unit-tested without pulling
 * React / JSX parsing into the test transform pipeline.
 *
 * Coordinates are (row, col) where `row` is an index into `flatRows` and `col`
 * is an index into `periods`.
 */

import { isFocusable, type FlatRow } from '@/lib/forecast/flat-rows'

export interface CellRef {
  row: number
  col: number
}

export interface Selection {
  /** First cell clicked / Shift-origin. Stable under extension. */
  anchor: CellRef
  /** Active / focused cell. Moves with extend. */
  focus: CellRef
}

export interface Range {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

/** Normalise a selection to a rectangular range (inclusive bounds). */
export function toRange(sel: Selection): Range {
  const { anchor, focus } = sel
  return {
    rowStart: Math.min(anchor.row, focus.row),
    rowEnd: Math.max(anchor.row, focus.row),
    colStart: Math.min(anchor.col, focus.col),
    colEnd: Math.max(anchor.col, focus.col),
  }
}

/** Row / column counts for a range (inclusive bounds → +1). */
export function sizeOf(range: Range): { rows: number; cols: number } {
  return {
    rows: range.rowEnd - range.rowStart + 1,
    cols: range.colEnd - range.colStart + 1,
  }
}

/** Walk all cells in a range, row-major. */
export function* iterateRange(range: Range): Generator<CellRef> {
  for (let row = range.rowStart; row <= range.rowEnd; row++) {
    for (let col = range.colStart; col <= range.colEnd; col++) {
      yield { row, col }
    }
  }
}

/** Inclusive point-in-range test. */
export function isInRange(range: Range, row: number, col: number): boolean {
  return (
    row >= range.rowStart &&
    row <= range.rowEnd &&
    col >= range.colStart &&
    col <= range.colEnd
  )
}

/** Extend the selection toward `to`: anchor stays, focus moves. */
export function extendSelection(sel: Selection, to: CellRef): Selection {
  return { anchor: sel.anchor, focus: { row: to.row, col: to.col } }
}

/** Collapse to a single cell (anchor === focus). */
export function collapseTo(cell: CellRef): Selection {
  return {
    anchor: { row: cell.row, col: cell.col },
    focus: { row: cell.row, col: cell.col },
  }
}

/**
 * Extend the focus by one step in `direction`. Anchor is preserved.
 *
 * For vertical moves, the focus walks past non-focusable rows (section
 * headers, pipeline rows, non-editable subtotals) until it finds one, matching
 * single-cell arrow nav. If it hits the edge with no focusable row found,
 * the selection is returned unchanged (no-op).
 *
 * For horizontal moves, it clamps at 0 / colMax (no wrapping).
 */
export function extendByArrow(
  sel: Selection,
  direction: 'up' | 'down' | 'left' | 'right',
  rowMax: number,
  colMax: number,
  isFocusableRow: (row: number) => boolean,
): Selection {
  const { focus } = sel

  if (direction === 'left' || direction === 'right') {
    const next = focus.col + (direction === 'right' ? 1 : -1)
    if (next < 0 || next > colMax) return sel
    return { anchor: sel.anchor, focus: { row: focus.row, col: next } }
  }

  const step = direction === 'down' ? 1 : -1
  let r = focus.row + step
  while (r >= 0 && r <= rowMax) {
    if (isFocusableRow(r)) {
      return { anchor: sel.anchor, focus: { row: r, col: focus.col } }
    }
    r += step
  }
  // No focusable row in that direction — no-op.
  return sel
}

/**
 * Ctrl+Arrow jump — Excel-style edge navigation.
 *
 * Horizontal (left/right): walks columns within the current row.
 * Vertical (up/down): walks rows, skipping non-focusable rows (they act as
 * transparent gaps — they don't break a non-zero run but also don't satisfy
 * the "found a non-zero cell" condition when coming from zero).
 *
 * Rules (matching Excel):
 * - Current cell is non-zero → find the last cell still non-zero in that
 *   direction (end of the contiguous run). If the very next cell is already
 *   zero (or there is no next cell), stay put (no-op).
 * - Current cell is zero → jump to the first non-zero cell in that direction.
 *   If none exists, jump to the grid edge (first/last focusable row or
 *   first/last column).
 */
export function jumpToEdge(
  fromRow: number,
  fromCol: number,
  direction: 'up' | 'down' | 'left' | 'right',
  flatRows: FlatRow[],
  periods: Array<{ id: string }>,
): { row: number; col: number } {
  const lastCol = periods.length - 1

  // ── Horizontal ──────────────────────────────────────────────────────────────
  if (direction === 'left' || direction === 'right') {
    const step = direction === 'right' ? 1 : -1
    const edgeCol = direction === 'right' ? lastCol : 0
    const fr = flatRows[fromRow]

    // Amount at current cell
    const currentAmount =
      fr?.kind === 'item' ? (fr.lineByPeriod.get(periods[fromCol]?.id ?? '')?.amount ?? 0) : 0

    if (currentAmount !== 0) {
      // Find the end of the contiguous non-zero run.
      const nextCol = fromCol + step
      if (nextCol < 0 || nextCol > lastCol) {
        // Already at grid edge — no-op.
        return { row: fromRow, col: fromCol }
      }
      const nextAmount =
        fr?.kind === 'item' ? (fr.lineByPeriod.get(periods[nextCol]?.id ?? '')?.amount ?? 0) : 0
      if (nextAmount === 0) {
        // Next cell is already zero — no-op (Excel behaviour).
        return { row: fromRow, col: fromCol }
      }
      // Walk to the last non-zero cell in the run.
      let c = nextCol
      while (true) {
        const ahead = c + step
        if (ahead < 0 || ahead > lastCol) break
        const aheadAmount =
          fr?.kind === 'item' ? (fr.lineByPeriod.get(periods[ahead]?.id ?? '')?.amount ?? 0) : 0
        if (aheadAmount === 0) break
        c = ahead
      }
      return { row: fromRow, col: c }
    } else {
      // Current is zero — jump to first non-zero cell in direction.
      for (let c = fromCol + step; step > 0 ? c <= lastCol : c >= 0; c += step) {
        const amt =
          fr?.kind === 'item' ? (fr.lineByPeriod.get(periods[c]?.id ?? '')?.amount ?? 0) : 0
        if (amt !== 0) return { row: fromRow, col: c }
      }
      // None found — jump to grid edge.
      return { row: fromRow, col: edgeCol }
    }
  }

  // ── Vertical ────────────────────────────────────────────────────────────────
  const step = direction === 'down' ? 1 : -1

  // Amount at current cell (subtotals / non-item rows treated as zero)
  const currentFr = flatRows[fromRow]
  const currentAmount =
    currentFr?.kind === 'item'
      ? (currentFr.lineByPeriod.get(periods[fromCol]?.id ?? '')?.amount ?? 0)
      : 0

  /** Amount at an arbitrary row index for the current column (zero for non-item rows). */
  const amountAt = (r: number): number => {
    const fr = flatRows[r]
    if (!fr || fr.kind !== 'item') return 0
    return fr.lineByPeriod.get(periods[fromCol]?.id ?? '')?.amount ?? 0
  }

  if (currentAmount !== 0) {
    // Find the end of the contiguous non-zero focusable run.
    // First, check if the very next focusable row is non-zero.
    let nextFocusableRow = -1
    for (let r = fromRow + step; step > 0 ? r < flatRows.length : r >= 0; r += step) {
      if (isFocusable(flatRows[r])) { nextFocusableRow = r; break }
    }
    if (nextFocusableRow === -1 || amountAt(nextFocusableRow) === 0) {
      // Already at edge or next focusable is zero — no-op.
      return { row: fromRow, col: fromCol }
    }
    // Walk to the last focusable row in the contiguous non-zero run.
    let lastNonZeroRow = nextFocusableRow
    for (let r = nextFocusableRow + step; step > 0 ? r < flatRows.length : r >= 0; r += step) {
      if (!isFocusable(flatRows[r])) continue // skip non-focusable
      if (amountAt(r) === 0) break
      lastNonZeroRow = r
    }
    return { row: lastNonZeroRow, col: fromCol }
  } else {
    // Current is zero — jump to first non-zero focusable row in direction.
    for (let r = fromRow + step; step > 0 ? r < flatRows.length : r >= 0; r += step) {
      if (!isFocusable(flatRows[r])) continue
      if (amountAt(r) !== 0) return { row: r, col: fromCol }
    }
    // None found — jump to the grid edge (last/first focusable row).
    let edgeRow = fromRow
    for (let r = fromRow + step; step > 0 ? r < flatRows.length : r >= 0; r += step) {
      if (isFocusable(flatRows[r])) edgeRow = r
    }
    return { row: edgeRow, col: fromCol }
  }
}

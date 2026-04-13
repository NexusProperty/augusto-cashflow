/**
 * Pure helpers for the Excel-style fill-handle on the forecast grid.
 *
 * MVP semantics:
 *   - Constant fill only (the source value is repeated; no series extrapolation).
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

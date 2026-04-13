/**
 * Pure planner for the "shift by N weeks" operation on the forecast grid.
 *
 * No I/O, no React imports — fully unit-testable.
 *
 * Terminology
 * -----------
 * - source cell: a (row, col) pair included in the current selection.
 * - target cell: the cell N columns to the right (positive N) or left (negative N).
 * - update:  both source and target already have a (non-pipeline) editable line
 *            → overwrite target with source amount, clear source to 0.
 * - create:  target has no line (or its line is null/missing)
 *            → create a new line at the target period inheriting the source
 *              line's entity/category/counterparty/notes/lineStatus; clear source to 0.
 * - collision: the target had a non-zero existing amount that will be overwritten.
 *
 * Skip rules (cell is not shifted):
 *  1. Row is not kind='item'.
 *  2. Source has no line for the period.
 *  3. Source line.source === 'pipeline'.
 *  4. Source line.amount === 0 (no-op shift).
 *  5. col + N < 0 OR col + N >= periods.length (out of range).
 *  6. Target line exists AND target line.source === 'pipeline'.
 */

import type { ForecastLine } from '@/lib/types'
import type { FlatRow } from './flat-rows'

/** A cell coordinate in the grid. */
export interface ShiftCellKey {
  row: number
  col: number
}

/** An amount-update instruction for an existing line. */
export interface ShiftAmountUpdate {
  id: string
  amount: number
}

/** A new-line creation request. */
export interface ShiftCreate {
  entityId: string
  categoryId: string
  periodId: string
  amount: number
  counterparty: string | null
  notes: string | null
  lineStatus: ForecastLine['lineStatus']
  /** The temp id for the optimistic local line. */
  tempId: string
  /** The source line's id — used to identify the clear update. */
  sourceLineId: string
}

export interface ShiftPlan {
  /**
   * All amount-update instructions, including:
   *   - source clears (set to 0)
   *   - target overwrites (for update-type shifts)
   */
  updates: ShiftAmountUpdate[]
  /** New-line creation requests (for create-type shifts). */
  creates: ShiftCreate[]
  /** Number of target cells that had a non-zero existing amount (will be overwritten). */
  collisions: number
  /** Number of source cells that were skipped. */
  skipped: number
}

export interface PlanShiftOpts {
  /**
   * When `true` (default), source cells are cleared to 0 after their amount
   * is copied to the target — classic "shift" / cut-paste semantics.
   *
   * When `false`, source cells are left untouched — the source amount is
   * copied to the target without removing it from the source (duplicate /
   * Ctrl+D semantics). Only target-overwrite updates and creates are emitted;
   * no source-clear updates are included in the result.
   */
  clearSource?: boolean
}

/**
 * Plan a shift-by-N-weeks operation.
 *
 * @param selectedCellKeys  - the `row:col` string keys of the selected cells.
 * @param n                 - number of periods to shift (positive = right/forward, negative = left/backward).
 * @param flatRows          - the current flat row list from the grid.
 * @param periods           - the ordered period list from the grid.
 * @param opts              - optional configuration; see {@link PlanShiftOpts}.
 */
export function planShift(
  selectedCellKeys: Iterable<string>,
  n: number,
  flatRows: FlatRow[],
  periods: Array<{ id: string }>,
  opts?: PlanShiftOpts,
): ShiftPlan {
  const clearSource = opts?.clearSource !== false // default true
  const updates: ShiftAmountUpdate[] = []
  const creates: ShiftCreate[] = []
  let collisions = 0
  let skipped = 0

  // Collect unique source cells (deduplicate in case the same key appears twice).
  const seen = new Set<string>()

  for (const key of selectedCellKeys) {
    if (seen.has(key)) continue
    seen.add(key)

    const [rowStr, colStr] = key.split(':')
    const row = Number(rowStr)
    const col = Number(colStr)

    const fr = flatRows[row]
    const period = periods[col]

    // Rule 1: row must be kind='item'.
    if (!fr || fr.kind !== 'item' || !period) {
      skipped++
      continue
    }

    // Rule 2 & 3: source must have an editable (non-pipeline) line.
    const sourceLine = fr.lineByPeriod.get(period.id)
    if (!sourceLine || sourceLine.source === 'pipeline') {
      skipped++
      continue
    }

    // Rule 4: source amount must be non-zero.
    if (sourceLine.amount === 0) {
      skipped++
      continue
    }

    // Rule 5: target column must be in range.
    const targetCol = col + n
    if (targetCol < 0 || targetCol >= periods.length) {
      skipped++
      continue
    }

    const targetPeriod = periods[targetCol]
    if (!targetPeriod) {
      skipped++
      continue
    }

    // Look up the existing line at the target period for this row.
    const targetLine = fr.lineByPeriod.get(targetPeriod.id)

    // Rule 6: if target has a pipeline line, skip.
    if (targetLine && targetLine.source === 'pipeline') {
      skipped++
      continue
    }

    // Clear the source (only when clearSource is true — shift semantics).
    if (clearSource) {
      updates.push({ id: sourceLine.id, amount: 0 })
    }

    if (targetLine) {
      // Update: overwrite the target with the source amount.
      if (targetLine.amount !== 0) collisions++
      updates.push({ id: targetLine.id, amount: sourceLine.amount })
    } else {
      // Create: synthesise a new line at the target period.
      const tempId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? `temp-${crypto.randomUUID()}`
          : `temp-shift-${Math.random().toString(36).slice(2)}-${Date.now()}`

      creates.push({
        entityId: sourceLine.entityId,
        categoryId: sourceLine.categoryId,
        periodId: targetPeriod.id,
        amount: sourceLine.amount,
        counterparty: sourceLine.counterparty,
        notes: sourceLine.notes,
        lineStatus: sourceLine.lineStatus,
        tempId,
        sourceLineId: sourceLine.id,
      })
    }
  }

  return { updates, creates, collisions, skipped }
}

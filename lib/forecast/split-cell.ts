/**
 * Pure planner for the "split cell across weeks" operation on the forecast grid.
 *
 * No I/O, no React imports — fully unit-testable.
 *
 * Terminology
 * -----------
 * - source cell: the right-clicked (row, col) pair.
 * - amounts[0]: the new amount for the source cell itself (always an update).
 * - amounts[1..N-1]: spill into the next N-1 periods on the same row.
 * - update: target already has an editable (non-pipeline) line → overwrite.
 * - create: target has no line → create a new line inheriting source metadata.
 * - collision: target had a non-zero existing amount that will be overwritten.
 *
 * Skip rules for spill targets (amounts[1..N-1]):
 *  1. Target column out of horizon (sourceCol + i >= periods.length) → skipped.
 *  2. Target has a pipeline line → skipped.
 *
 * Pipeline source guard:
 *  If sourceRow.isPipeline, return an empty plan immediately.
 */

import type { ForecastLine } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SplitCellArgs {
  sourceLine: ForecastLine
  sourceRow: { kind: 'item'; lineByPeriod: Map<string, ForecastLine>; isPipeline: boolean }
  sourceCol: number
  amounts: number[]
  periods: Array<{ id: string }>
}

export interface SplitCellPlan {
  updates: Array<{ id: string; amount: number }>
  creates: Array<{
    entityId: string
    categoryId: string
    periodId: string
    amount: number
    counterparty: string | null
    notes: string | null
    lineStatus: ForecastLine['lineStatus']
    tempId: string
    sourceLineId: string
  }>
  collisions: number
  skipped: number
}

// ── Amount parser ─────────────────────────────────────────────────────────────

/**
 * Parse a comma-separated string of amounts.
 *
 * Separator: comma followed by ONE OR MORE whitespace characters (`, `).
 * This unambiguously handles currency amounts containing thousands-separator
 * commas, e.g. "$1,500, $2,500" → [1500, 2500].
 *
 * Ambiguous inputs with no space after the comma (e.g. "1,500,2,500") are NOT
 * split — they produce a single token that fails the "at least two" check
 * instead of silently producing wrong values.
 *
 * Steps:
 *   1. Strip `$` globally.
 *   2. Split on `/,\s+/` (comma + one or more whitespace) — the only separator.
 *   3. For each token, strip all remaining `,` (thousands separators).
 *   4. parseFloat each token.
 *
 * Returns `{ ok: false }` if any token is NaN, empty, or fewer than 2 values.
 */
export function parseSplitAmounts(
  input: string,
): { ok: true; values: number[] } | { ok: false; error: string } {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Enter at least two amounts' }

  // 1. Strip currency symbols.
  const stripped = trimmed.replace(/\$/g, '')

  // 2. Split ONLY on comma+whitespace. Commas NOT followed by whitespace are
  //    treated as thousands separators and stripped per-token in step 3.
  //    This means "1,500,2,500" (no spaces) → single token → fails length check.
  const tokens = stripped.split(/,\s+/)

  if (tokens.length < 2) return { ok: false, error: 'Enter at least two amounts' }

  const values: number[] = []
  for (const token of tokens) {
    // 3. Strip remaining commas (thousands separators) and surrounding whitespace.
    const cleaned = token.trim().replace(/,/g, '')
    if (!cleaned) return { ok: false, error: 'Empty value' }
    const n = parseFloat(cleaned)
    if (isNaN(n)) return { ok: false, error: `"${token.trim()}" is not a number` }
    values.push(n)
  }

  return { ok: true, values }
}

// ── Planner ───────────────────────────────────────────────────────────────────

/**
 * Plan a split-cell operation.
 *
 * amounts[0] always updates the source line.
 * amounts[1..N-1] spill into subsequent periods on the same row.
 */
export function planSplitCell(args: SplitCellArgs): SplitCellPlan {
  const { sourceLine, sourceRow, sourceCol, amounts, periods } = args

  const updates: SplitCellPlan['updates'] = []
  const creates: SplitCellPlan['creates'] = []
  let collisions = 0
  let skipped = 0

  // Pipeline rows are not splittable; return an empty plan.
  if (sourceRow.isPipeline) return { updates, creates, collisions, skipped }

  // Empty amounts → no-op.
  if (amounts.length === 0) return { updates, creates, collisions, skipped }

  // amounts[0] always updates the source cell.
  updates.push({ id: sourceLine.id, amount: amounts[0] })

  // amounts[1..N-1] spill into subsequent periods.
  for (let i = 1; i < amounts.length; i++) {
    const targetCol = sourceCol + i

    // Rule: out of horizon.
    if (targetCol >= periods.length) {
      skipped++
      continue
    }

    const targetPeriod = periods[targetCol]
    if (!targetPeriod) {
      skipped++
      continue
    }

    const targetLine = sourceRow.lineByPeriod.get(targetPeriod.id)

    // Rule: pipeline target → skip.
    if (targetLine && targetLine.source === 'pipeline') {
      skipped++
      continue
    }

    if (targetLine) {
      // Editable target exists → update.
      if (targetLine.amount !== 0) collisions++
      updates.push({ id: targetLine.id, amount: amounts[i] })
    } else {
      // Empty target → create inheriting source metadata.
      const tempId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? `temp-${crypto.randomUUID()}`
          : `temp-split-${Math.random().toString(36).slice(2)}-${Date.now()}`

      creates.push({
        entityId: sourceLine.entityId,
        categoryId: sourceLine.categoryId,
        periodId: targetPeriod.id,
        amount: amounts[i],
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

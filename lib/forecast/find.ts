/**
 * Pure find/search helpers for the forecast grid.
 * No React, no Supabase — safe to import in unit tests without DOM.
 *
 * ## Match ordering rule
 * Walk `flatRows` top-to-bottom. For each matching row:
 *   - Emit one `FindMatch` per matching (row, col) pair for amount hits.
 *   - If the counterparty or notes fields match AND no amount cell on this row
 *     already produced a match, emit ONE row-level match (col=null) for that
 *     field. If both counterparty AND notes match on a row with no amount hit,
 *     only the first matching field is emitted (counterparty takes priority).
 *
 * This means a row can produce 0, 1, or many matches:
 *   - No match in any field → 0 matches.
 *   - Amount hit(s) only → N cell-level matches (one per period column).
 *   - Text field(s) only → exactly 1 row-level match (col=null).
 *   - Amount + text → only the amount cell(s) are emitted (row-level is suppressed).
 */

import type { FlatRow } from './flat-rows'
import type { Period } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

export interface FindMatch {
  /** Index into flatRows. */
  row: number
  /** Period column index, or null for a row-level (text) match. */
  col: number | null
  hitKind: 'counterparty' | 'notes' | 'amount'
  /** Line id — populated for amount matches only. */
  lineId?: string
}

// ── Normaliser ────────────────────────────────────────────────────────────────

/**
 * Strip currency formatting from a query string and return a number if the
 * remaining text parses as a finite number, otherwise null.
 *
 * Strips: `$`, `,`, leading/trailing whitespace.
 * Parentheses are treated as negative sign: `(500)` → `-500`.
 *
 * Examples:
 *   `"$1,500"` → 1500
 *   `"(500)"` → -500
 *   `"abc"` → null
 *   `""` → null
 */
export function normaliseAmountQuery(query: string): number | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  // Parens → negative.
  const hasParens = trimmed.startsWith('(') && trimmed.endsWith(')')
  const stripped = hasParens
    ? trimmed.slice(1, -1).replace(/[$,]/g, '').trim()
    : trimmed.replace(/[$,]/g, '').trim()

  if (!stripped) return null
  const n = parseFloat(stripped)
  if (!Number.isFinite(n)) return null
  return hasParens ? -n : n
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

/**
 * Advance the cursor forward by one position, wrapping around.
 * Returns 0 for empty list (-1 sentinel never emitted — caller guards).
 *
 * @param current - current cursor index, or null when nothing is selected yet.
 * @param total - length of the match list.
 */
export function nextMatchIndex(current: number | null, total: number): number {
  if (total === 0) return 0
  if (current === null) return 0
  return (current + 1) % total
}

/**
 * Retreat the cursor backward by one position, wrapping around.
 *
 * @param current - current cursor index, or null when nothing is selected yet.
 * @param total - length of the match list.
 */
export function prevMatchIndex(current: number | null, total: number): number {
  if (total === 0) return 0
  if (current === null) return total - 1
  return (current - 1 + total) % total
}

// ── Main builder ──────────────────────────────────────────────────────────────

interface BuildMatchListArgs {
  flatRows: FlatRow[]
  periods: Period[]
  query: string
}

/**
 * Build an ordered list of matches for the given query string.
 *
 * Returns an empty array for an empty or whitespace-only query.
 *
 * Matching rules (all case-insensitive for text):
 *   - `counterparty`: substring containment.
 *   - `notes`: substring containment.
 *   - `amount`: numeric equality (after stripping `$`, `,`, `()`)
 *               OR raw substring match on `formatCurrency(line.amount)`.
 */
export function buildMatchList({
  flatRows,
  periods,
  query,
}: BuildMatchListArgs): FindMatch[] {
  const q = query.trim()
  if (!q) return []

  const qLower = q.toLowerCase()
  const numericQuery = normaliseAmountQuery(q)

  // Build a fast lookup: periodId → column index.
  const periodColByPeriodId = new Map<string, number>()
  for (let i = 0; i < periods.length; i++) {
    periodColByPeriodId.set(periods[i]!.id, i)
  }

  const matches: FindMatch[] = []

  for (let rowIdx = 0; rowIdx < flatRows.length; rowIdx++) {
    const fr = flatRows[rowIdx]!

    // Only item rows have searchable data.
    if (fr.kind !== 'item') continue

    // Gather all lines for this row (one per period, keyed by periodId).
    const rowLines = Array.from(fr.lineByPeriod.values())
    if (rowLines.length === 0) continue

    // Use the first line to get the row-level text fields (all lines in a row
    // share the same counterparty / notes grouping key).
    const templateLine = rowLines[0]!

    let anyCellHit = false

    // ── Amount hits (cell-level) ─────────────────────────────────────────
    for (const line of rowLines) {
      const colIdx = periodColByPeriodId.get(line.periodId)
      if (colIdx === undefined) continue

      const formatted = formatCurrency(line.amount)

      const numericMatch =
        numericQuery !== null && line.amount === numericQuery
      const substringMatch =
        formatted.toLowerCase().includes(qLower)

      if (numericMatch || substringMatch) {
        matches.push({
          row: rowIdx,
          col: colIdx,
          hitKind: 'amount',
          lineId: line.id,
        })
        anyCellHit = true
      }
    }

    // ── Row-level text hits (only if no cell already matched) ─────────────
    if (!anyCellHit) {
      const cpText = templateLine.counterparty ?? ''
      if (cpText.toLowerCase().includes(qLower)) {
        matches.push({ row: rowIdx, col: null, hitKind: 'counterparty' })
        continue // counterparty takes priority; don't also emit notes
      }

      const notesText = templateLine.notes ?? ''
      if (notesText.toLowerCase().includes(qLower)) {
        matches.push({ row: rowIdx, col: null, hitKind: 'notes' })
      }
    }
  }

  return matches
}

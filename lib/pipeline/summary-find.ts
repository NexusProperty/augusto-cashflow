/**
 * Pure find/search helpers for the pipeline summary grid.
 * No React, no Supabase — safe to import in unit tests without DOM.
 *
 * ## Match ordering
 * Walk `flatRows` top-to-bottom. For each row emit:
 *   - Amount cell-level matches (left-to-right), OR
 *   - If no amount matched on the row, one row-level match (entity takes
 *     priority over metric-label).
 */

import type { FlatSummaryRow } from './summary-flat-rows'

export interface FindMatch {
  row: number
  /** Null for row-level (entity or metric) hits. `months.length` for the virtual Total column. */
  col: number | null
  hitKind: 'entity' | 'metric' | 'amount'
}

export interface NormalisedAmount {
  amount: number
  tolerance: number
}

/**
 * Parse an amount-like query into a target number + tolerance.
 * Strips `$`, `,`, spaces. Treats `( … )` as negative. Returns null when
 * the remaining text is not a finite number.
 *
 * Tolerance is ±1 to account for display rounding (`maximumFractionDigits: 0`).
 */
export function normaliseAmountQuery(raw: string): NormalisedAmount | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parens = trimmed.startsWith('(') && trimmed.endsWith(')')
  const inner = parens ? trimmed.slice(1, -1) : trimmed
  const stripped = inner.replace(/[$,\s]/g, '')
  if (!stripped) return null
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null
  const n = parseFloat(stripped)
  if (!Number.isFinite(n)) return null
  return { amount: parens ? -n : n, tolerance: 1 }
}

function sumArray(arr: number[]): number {
  let s = 0
  for (const v of arr) s += v
  return s
}

function fmtAmount(n: number): string {
  if (n === 0) return ''
  return n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })
}

/**
 * Build an ordered list of matches for the given query string.
 *
 * @param flatRows  Visible flat rows (for find, callers usually pass the
 *                  fully-expanded list so collapsed entities are still searchable).
 * @param monthsLen Number of month columns. Total column = `monthsLen`.
 * @param rawQuery  The raw user query. Empty/whitespace yields [].
 */
export function buildMatchList(
  flatRows: FlatSummaryRow[],
  monthsLen: number,
  rawQuery: string,
): FindMatch[] {
  const q = rawQuery.trim()
  if (!q) return []

  const qLower = q.toLowerCase()
  const numeric = normaliseAmountQuery(q)
  const matches: FindMatch[] = []

  for (let r = 0; r < flatRows.length; r++) {
    const fr = flatRows[r]!
    const total = sumArray(fr.values)

    // ── Amount cell hits ───────────────────────────────────────────────
    const cellHits: FindMatch[] = []
    for (let c = 0; c < fr.values.length; c++) {
      const v = fr.values[c]!
      if (matchesAmount(v, qLower, numeric)) {
        cellHits.push({ row: r, col: c, hitKind: 'amount' })
      }
    }
    // Total column
    if (matchesAmount(total, qLower, numeric)) {
      cellHits.push({ row: r, col: monthsLen, hitKind: 'amount' })
    }

    if (cellHits.length > 0) {
      matches.push(...cellHits)
      continue
    }

    // ── Row-level text hits ────────────────────────────────────────────
    if (fr.entityName.toLowerCase().includes(qLower)) {
      matches.push({ row: r, col: null, hitKind: 'entity' })
      continue
    }
    if (fr.metricLabel.toLowerCase().includes(qLower)) {
      matches.push({ row: r, col: null, hitKind: 'metric' })
    }
  }

  return matches
}

function matchesAmount(
  value: number,
  qLower: string,
  numeric: NormalisedAmount | null,
): boolean {
  if (numeric !== null && Math.abs(value - numeric.amount) <= numeric.tolerance) {
    return true
  }
  const formatted = fmtAmount(value).toLowerCase()
  if (formatted && formatted.includes(qLower)) return true
  return false
}

/** Advance cursor forward, wrapping. */
export function nextMatchIndex(current: number | null, total: number): number {
  if (total === 0) return 0
  if (current === null) return 0
  return (current + 1) % total
}

/** Retreat cursor backward, wrapping. */
export function prevMatchIndex(current: number | null, total: number): number {
  if (total === 0) return 0
  if (current === null) return total - 1
  return (current - 1 + total) % total
}

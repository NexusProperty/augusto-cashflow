/**
 * Pure CSV builder for the pipeline summary grid.
 * No React, no DOM, no Supabase — safe for unit tests.
 *
 * The returned string starts with a UTF-8 BOM (\uFEFF) so Excel opens it
 * correctly. Lines are separated by \r\n and fields by commas. Fields that
 * contain commas, double-quotes, or newlines are RFC-4180 quoted (surrounded
 * with " and internal " doubled to "").
 *
 * Kept independent of `lib/forecast/export.ts` — the two modules deliberately
 * don't share code; the escape helper is copied verbatim.
 */

import type { BUSummaryRow } from '@/lib/pipeline/types'
import {
  METRIC_ROWS,
  type FlatSummaryRow,
  type SummaryMetricKey,
} from '@/lib/pipeline/summary-flat-rows'
import { forEachCellInRange, type Selection } from '@/lib/pipeline/summary-selection'
import { getMonthLabel } from '@/lib/pipeline/fiscal-year'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExportSummaryArgs {
  rows: BUSummaryRow[]
  months: string[]
  scope: 'all' | 'view'
  /** entityId → isCollapsed. Only consulted when scope === 'view'. */
  collapsed?: Record<string, boolean>
}

export interface ExportSummarySelectionArgs {
  flatRows: FlatSummaryRow[]
  months: string[]
  selection: Selection
  scope: 'selection'
}

// ── CSV encoding ──────────────────────────────────────────────────────────────

/**
 * Escape a single field value per RFC 4180. Copied verbatim from
 * `lib/forecast/export.ts` — the two modules are intentionally independent.
 */
export function escapeCsvField(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function row(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(',')
}

function sumArray(arr: number[]): number {
  let total = 0
  for (const v of arr) total += v
  return total
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildSummaryCsv(
  args: ExportSummaryArgs | ExportSummarySelectionArgs,
): string {
  if (args.scope === 'selection') {
    return buildSelectionCsv(args)
  }
  return buildPivotCsv(args)
}

function buildPivotCsv(args: ExportSummaryArgs): string {
  const { rows, months, scope, collapsed = {} } = args

  const monthLabels = months.map((m) => getMonthLabel(m))
  const header: (string | number)[] = ['Entity / Metric', ...monthLabels, 'Total']
  const csvRows: string[] = [row(header)]

  const visibleRows = scope === 'view'
    ? rows.filter((r) => !collapsed[r.entityId])
    : rows

  for (const r of visibleRows) {
    // Entity header row: name followed by empty cells.
    csvRows.push(row([r.entityName, ...months.map(() => ''), '']))
    for (const spec of METRIC_ROWS) {
      const vals = r[spec.metricKey]
      csvRows.push(row([spec.label, ...vals, sumArray(vals)]))
    }
  }

  // GROUP TOTAL block — emit only when there are 2+ entities in the ORIGINAL
  // rows (match the table's visible-group-total behavior: it's driven by
  // rows.length, not by view-visibility).
  if (rows.length > 1) {
    const monthCount = months.length
    const totals: Record<SummaryMetricKey, number[]> = {
      confirmedAndAwaiting: new Array(monthCount).fill(0),
      upcomingAndSpeculative: new Array(monthCount).fill(0),
      totalForecast: new Array(monthCount).fill(0),
      target: new Array(monthCount).fill(0),
      variance: new Array(monthCount).fill(0),
      pnlForecast: new Array(monthCount).fill(0),
    }
    for (const r of rows) {
      for (const spec of METRIC_ROWS) {
        const src = r[spec.metricKey]
        const dst = totals[spec.metricKey]
        for (let i = 0; i < monthCount; i++) {
          dst[i] = (dst[i] ?? 0) + (src[i] ?? 0)
        }
      }
    }
    csvRows.push(row(['GROUP TOTAL', ...months.map(() => ''), '']))
    for (const spec of METRIC_ROWS) {
      const vals = totals[spec.metricKey]
      csvRows.push(row([spec.label, ...vals, sumArray(vals)]))
    }
  }

  return '\uFEFF' + csvRows.join('\r\n')
}

function buildSelectionCsv(args: ExportSummarySelectionArgs): string {
  const { flatRows, months, selection } = args
  const csvRows: string[] = [row(['Entity', 'Metric', 'Month', 'Value'])]

  const monthLabels = months.map((m) => getMonthLabel(m))

  forEachCellInRange(selection, months.length, (r, c, isTotalCol) => {
    const fr = flatRows[r]
    if (!fr) return
    let monthField: string
    let value: number
    if (isTotalCol) {
      monthField = 'Total'
      value = sumArray(fr.values)
    } else if (c < months.length) {
      monthField = monthLabels[c] ?? ''
      value = fr.values[c] ?? 0
    } else {
      return
    }
    csvRows.push(row([fr.entityName, fr.metricLabel, monthField, value]))
  })

  return '\uFEFF' + csvRows.join('\r\n')
}

/**
 * Flat-row model for the pipeline summary grid.
 *
 * Walks the BUSummaryRow list and emits one FlatSummaryRow per selectable
 * metric row currently visible (6 metrics per non-collapsed entity, plus
 * 6 GROUP TOTAL rows when there are 2+ entities). Entity header bars are
 * NOT included — they are not selectable / not keyboard-navigable.
 *
 * Used by SummaryTable for cell selection, and by later tasks (stats, find,
 * export) for coordinate resolution.
 */

import type { BUSummaryRow } from '@/lib/pipeline/types'

export type SummaryMetricKey =
  | 'confirmedAndAwaiting'
  | 'upcomingAndSpeculative'
  | 'totalForecast'
  | 'target'
  | 'variance'
  | 'pnlForecast'

export interface FlatSummaryRow {
  kind: 'entity-metric' | 'group-total-metric'
  /** null for group-total rows */
  entityId: string | null
  entityName: string
  metricKey: SummaryMetricKey
  metricLabel: string
  /** length === months.length */
  values: number[]
}

/**
 * Shared spec describing the 6 metric rows rendered per entity and for the
 * GROUP TOTAL block. Single source of truth for metric order + labels; used
 * by both `buildFlatSummaryRows` (below) and `SummaryTable` (rendering).
 */
export type MetricRowSpec = {
  metricKey: SummaryMetricKey
  label: string
  variant: 'default' | 'variance'
  bold?: boolean
  italic?: boolean
  highlight?: boolean
}

export const METRIC_ROWS: readonly MetricRowSpec[] = [
  { metricKey: 'confirmedAndAwaiting',   label: 'Confirmed + Awaiting',   variant: 'default', highlight: true },
  { metricKey: 'upcomingAndSpeculative', label: 'Upcoming & Speculative', variant: 'default' },
  { metricKey: 'totalForecast',          label: 'Total Forecast',         variant: 'default', bold: true },
  { metricKey: 'target',                 label: 'Target',                 variant: 'default' },
  { metricKey: 'variance',               label: 'Variance',               variant: 'variance' },
  { metricKey: 'pnlForecast',            label: 'P&L Forecast',           variant: 'default', italic: true },
] as const

/**
 * Build the flat (visible-row-index → row) list for the summary grid.
 *
 * @param rows        BU summary rows (one per entity).
 * @param collapsed   Map of entityId → isCollapsed. Collapsed entities
 *                    contribute zero flat rows.
 */
export function buildFlatSummaryRows(
  rows: BUSummaryRow[],
  collapsed: Record<string, boolean>,
): FlatSummaryRow[] {
  const out: FlatSummaryRow[] = []

  for (const row of rows) {
    if (collapsed[row.entityId]) continue
    for (const spec of METRIC_ROWS) {
      out.push({
        kind: 'entity-metric',
        entityId: row.entityId,
        entityName: row.entityName,
        metricKey: spec.metricKey,
        metricLabel: spec.label,
        values: row[spec.metricKey],
      })
    }
  }

  if (rows.length > 1) {
    const monthCount = rows[0]?.confirmedAndAwaiting.length ?? 0
    // Single-pass accumulator across all metrics.
    const totals: Record<SummaryMetricKey, number[]> = {
      confirmedAndAwaiting: new Array(monthCount).fill(0),
      upcomingAndSpeculative: new Array(monthCount).fill(0),
      totalForecast: new Array(monthCount).fill(0),
      target: new Array(monthCount).fill(0),
      variance: new Array(monthCount).fill(0),
      pnlForecast: new Array(monthCount).fill(0),
    }
    for (const row of rows) {
      for (const spec of METRIC_ROWS) {
        const src = row[spec.metricKey]
        const dst = totals[spec.metricKey]
        for (let i = 0; i < monthCount; i++) {
          dst[i] = (dst[i] ?? 0) + (src[i] ?? 0)
        }
      }
    }
    for (const spec of METRIC_ROWS) {
      out.push({
        kind: 'group-total-metric',
        entityId: null,
        entityName: 'GROUP TOTAL',
        metricKey: spec.metricKey,
        metricLabel: spec.label,
        values: totals[spec.metricKey],
      })
    }
  }

  return out
}

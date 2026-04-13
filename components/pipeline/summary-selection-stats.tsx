'use client'

import { formatCurrency } from '@/lib/utils'
import type { Aggregates } from '@/lib/forecast/aggregates'

/**
 * Compact inline stats chip for the pipeline summary grid's multi-cell
 * selection. Hidden when fewer than 2 cells are selected (i.e. `aggregates`
 * is null).
 *
 * Visual treatment mirrors the forecast grid's SelectionStatsChip verbatim.
 */
export function SummarySelectionStats({ aggregates }: { aggregates: Aggregates | null }) {
  if (!aggregates) return null
  const avgDisplay = Math.round(aggregates.avg)
  return (
    <span
      title={`Selection: ${aggregates.count} cells`}
      className="inline-flex items-center gap-3 rounded-md bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 tabular-nums"
    >
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">Σ</span>
        <span className={aggregates.sum < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(aggregates.sum)}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">⌀</span>
        <span className={avgDisplay < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(avgDisplay)}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">#</span>
        <span className="text-zinc-800">{aggregates.count}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">min</span>
        <span className={aggregates.min < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(aggregates.min)}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">max</span>
        <span className={aggregates.max < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(aggregates.max)}
        </span>
      </span>
    </span>
  )
}

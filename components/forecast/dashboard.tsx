'use client'

import type { WeekSummary } from '@/lib/types'
import { formatCurrencyCompact } from '@/lib/utils'
import { SummaryCards } from './summary-cards'
import { ClosingBalanceChart } from './closing-balance-chart'
import { CondensedTable } from './condensed-table'

interface DashboardProps {
  summaries: WeekSummary[]
  currentWeek: WeekSummary | null
  weeksUntilBreach: number | null
  pipelineTotal: number
  pipelineWeighted: number
  odFacilityLimit: number
  pipelineByStage?: {
    confirmed: number
    awaiting: number
    upcoming: number
    speculative: number
  }
}

export function Dashboard(props: DashboardProps) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Section 1: Stats row */}
      <div className="border-b border-zinc-100">
        <SummaryCards
          currentWeek={props.currentWeek}
          weeksUntilBreach={props.weeksUntilBreach}
          pipelineTotal={props.pipelineTotal}
          pipelineWeighted={props.pipelineWeighted}
          odFacilityLimit={props.odFacilityLimit}
        />
      </div>

      {/* Section 2: Chart + Pipeline breakdown */}
      <div className="grid grid-cols-3 divide-x divide-zinc-100 border-b border-zinc-100">
        <div className="col-span-2 px-6 py-5">
          <ClosingBalanceChart summaries={props.summaries} />
        </div>
        <div className="px-5 py-5">
          <PipelineBreakdown stages={props.pipelineByStage} />
        </div>
      </div>

      {/* Section 3: Condensed table */}
      <div className="px-6 py-4">
        <CondensedTable summaries={props.summaries} />
      </div>
    </div>
  )
}

function PipelineBreakdown({
  stages,
}: {
  stages?: { confirmed: number; awaiting: number; upcoming: number; speculative: number }
}) {
  if (!stages) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 mb-3">Pipeline by Stage</h3>
        <p className="text-xs text-zinc-400">No pipeline data</p>
      </div>
    )
  }

  const maxVal = Math.max(stages.confirmed, stages.awaiting, stages.upcoming, stages.speculative, 1)

  const bars = [
    { label: 'Confirmed', value: stages.confirmed, color: 'bg-emerald-500' },
    { label: 'Awaiting', value: stages.awaiting, color: 'bg-amber-500' },
    { label: 'Upcoming', value: stages.upcoming, color: 'bg-sky-500' },
    { label: 'Speculative', value: stages.speculative, color: 'bg-rose-400' },
  ]

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">Pipeline by Stage</h3>
      <div className="space-y-3">
        {bars.map(({ label, value, color }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-500">{label}</span>
              <span className="font-medium text-zinc-900">
                {value > 0 ? formatCurrencyCompact(value) : '—'}
              </span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full">
              <div
                className={`h-2 ${color} rounded-full`}
                style={{ width: value > 0 ? `${Math.max((value / maxVal) * 100, 2)}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

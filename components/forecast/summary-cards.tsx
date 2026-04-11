import { cn, formatCurrency } from '@/lib/utils'
import type { WeekSummary } from '@/lib/types'

interface SummaryCardsProps {
  currentWeek: WeekSummary | null
  weeksUntilBreach: number | null
  pipelineTotal: number
  pipelineWeighted: number
  odFacilityLimit: number
  groupTarget?: number
}

export function SummaryCards({
  currentWeek,
  weeksUntilBreach,
  pipelineTotal,
  pipelineWeighted,
  odFacilityLimit,
  groupTarget,
}: SummaryCardsProps) {
  const closingBalance = currentWeek?.closingBalance ?? 0
  const availableCash = currentWeek?.availableCash ?? 0

  const odUtilPct =
    odFacilityLimit > 0
      ? Math.max(0, Math.min(((odFacilityLimit - availableCash) / odFacilityLimit) * 100, 100))
      : 0

  const target = groupTarget ?? 675_000
  const pipelinePct = Math.min((pipelineTotal / target) * 100, 100)

  return (
    <div className="grid grid-cols-4 divide-x divide-zinc-100">
      {/* 1 — Cash Position */}
      <div className="px-5 py-5">
        <div className="text-xs font-medium text-zinc-500">Cash Position</div>
        <div
          className={cn(
            'mt-1 text-2xl font-bold tabular-nums',
            closingBalance < 0 ? 'text-red-600' : 'text-zinc-900',
          )}
        >
          {currentWeek ? formatCurrency(closingBalance) : '—'}
        </div>
        {currentWeek && (
          <div className="mt-1 text-xs text-zinc-400">week ending {currentWeek.weekEnding}</div>
        )}
      </div>

      {/* 2 — Available Cash */}
      <div className="px-5 py-5">
        <div className="text-xs font-medium text-zinc-500">Available Cash</div>
        <div
          className={cn(
            'mt-1 text-2xl font-bold tabular-nums',
            availableCash <= 0 ? 'text-red-600' : 'text-emerald-600',
          )}
        >
          {currentWeek ? formatCurrency(availableCash) : '—'}
        </div>
        {odFacilityLimit > 0 && (
          <div className="mt-2">
            <div className="h-1.5 w-full rounded-full bg-zinc-100">
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  odUtilPct > 80 ? 'bg-red-500' : odUtilPct > 50 ? 'bg-amber-400' : 'bg-emerald-500',
                )}
                style={{ width: `${odUtilPct}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {formatCurrency(odFacilityLimit)} facility
            </div>
          </div>
        )}
      </div>

      {/* 3 — Weeks to Breach */}
      <div className="px-5 py-5">
        <div className="text-xs font-medium text-zinc-500">Weeks to Breach</div>
        <div
          className={cn(
            'mt-1 text-2xl font-bold tabular-nums',
            weeksUntilBreach === null ? 'text-emerald-600' : weeksUntilBreach <= 4 ? 'text-red-600' : 'text-amber-500',
          )}
        >
          {weeksUntilBreach !== null ? weeksUntilBreach : 'None'}
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          {weeksUntilBreach !== null ? 'weeks until OD breach' : '18-week horizon clear'}
        </div>
      </div>

      {/* 4 — Pipeline */}
      <div className="px-5 py-5">
        <div className="text-xs font-medium text-zinc-500">Pipeline</div>
        <div className={cn('mt-1 text-2xl font-bold tabular-nums', pipelineTotal > 0 ? 'text-amber-600' : 'text-zinc-900')}>
          {formatCurrency(pipelineTotal)}
        </div>
        <div className="mt-2">
          <div className="h-1.5 w-full rounded-full bg-zinc-100">
            <div
              className="h-1.5 rounded-full bg-amber-500"
              style={{ width: `${Math.max(pipelinePct, pipelineTotal > 0 ? 2 : 0)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            {Math.round(pipelinePct)}% of {formatCurrency(target)} · weighted {formatCurrency(pipelineWeighted)}
          </div>
        </div>
      </div>
    </div>
  )
}

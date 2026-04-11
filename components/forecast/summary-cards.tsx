import { cn, formatCurrency } from '@/lib/utils'
import type { WeekSummary } from '@/lib/types'

interface SummaryCardsProps {
  currentWeek: WeekSummary | null
  weeksUntilBreach: number | null
  pipelineTotal: number
  pipelineWeighted: number
  odFacilityLimit: number
}

export function SummaryCards({ currentWeek, weeksUntilBreach, pipelineTotal, pipelineWeighted, odFacilityLimit }: SummaryCardsProps) {
  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <Card
        label="Current Cash Position"
        value={currentWeek ? formatCurrency(currentWeek.closingBalance) : '—'}
        change={currentWeek ? `As at ${currentWeek.weekEnding}` : ''}
        negative={currentWeek ? currentWeek.closingBalance < 0 : false}
      />
      <Card
        label="OD Headroom"
        value={currentWeek ? formatCurrency(currentWeek.availableCash) : '—'}
        change={currentWeek ? `${formatCurrency(odFacilityLimit)} facility` : ''}
        negative={currentWeek ? currentWeek.availableCash <= 0 : false}
      />
      <Card
        label="Weeks Until OD Breach"
        value={weeksUntilBreach !== null ? `${weeksUntilBreach}` : 'None'}
        change={weeksUntilBreach !== null ? 'Action required' : 'Position healthy'}
        negative={weeksUntilBreach !== null && weeksUntilBreach <= 4}
      />
      <Card
        label="Pipeline (Unconfirmed)"
        value={formatCurrency(pipelineTotal)}
        change={`Weighted: ${formatCurrency(pipelineWeighted)}`}
      />
    </div>
  )
}

function Card({ label, value, change, negative }: {
  label: string; value: string; change: string; negative?: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="text-sm font-medium text-zinc-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tracking-tight', negative ? 'text-red-600' : 'text-zinc-900')}>
        {value}
      </div>
      <div className={cn('mt-1 text-sm', negative ? 'text-red-600' : 'text-zinc-500')}>
        {change}
      </div>
    </div>
  )
}

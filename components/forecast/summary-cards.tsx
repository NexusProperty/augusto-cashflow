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
    <div className="mb-5 grid grid-cols-4 gap-3">
      <Card
        label="Current Cash Position"
        value={currentWeek ? formatCurrency(currentWeek.closingBalance) : '—'}
        valueColor={currentWeek && currentWeek.closingBalance < 0 ? 'text-negative' : 'text-positive'}
        subtext={currentWeek ? `As at ${currentWeek.weekEnding}` : ''}
      />
      <Card
        label="OD Headroom"
        value={currentWeek ? formatCurrency(currentWeek.availableCash) : '—'}
        valueColor={currentWeek && currentWeek.availableCash > 0 ? 'text-positive' : 'text-negative'}
        subtext={currentWeek ? `${formatCurrency(odFacilityLimit)} facility` : ''}
      />
      <Card
        label="Weeks Until OD Breach"
        value={weeksUntilBreach !== null ? `${weeksUntilBreach} weeks` : 'None'}
        valueColor={weeksUntilBreach !== null && weeksUntilBreach <= 4 ? 'text-negative' : 'text-warning'}
        subtext={weeksUntilBreach !== null ? 'Action required' : 'Position healthy'}
      />
      <Card
        label="Pipeline (Unconfirmed)"
        value={formatCurrency(pipelineTotal)}
        valueColor="text-brand"
        subtext={`Weighted: ${formatCurrency(pipelineWeighted)}`}
      />
    </div>
  )
}

function Card({ label, value, valueColor, subtext }: {
  label: string; value: string; valueColor: string; subtext: string
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold', valueColor)}>{value}</div>
      <div className="mt-1 text-xs text-text-muted">{subtext}</div>
    </div>
  )
}

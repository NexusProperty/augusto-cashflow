import { memo } from 'react'
import { cn } from '@/lib/utils'
import { InlineCell } from './inline-cell'
import type { ForecastLine, Period, SourceType, LineStatus } from '@/lib/types'

interface ForecastRowProps {
  label: string
  lines: Map<string, ForecastLine>
  periods: Period[]
  depth: number
  isSubtotal?: boolean
  isTotal?: boolean
  isComputed?: boolean
  source?: SourceType
  confidence?: number
  onCellSave?: (periodId: string, amount: number) => void
  badge?: React.ReactNode
  title?: string
  readOnlyCells?: boolean
  lineStatus?: LineStatus | null
}

const depthStyles: Record<number, string> = {
  0: 'bg-zinc-100 text-zinc-900 font-semibold',
  1: 'text-zinc-600',
  2: '',
}

const sourceColors: Record<SourceType, string> = {
  manual: 'text-zinc-400',
  document: 'text-indigo-500',
  recurring: 'text-emerald-500',
  pipeline: 'text-amber-500',
}

const statusBadgeConfig: Record<string, { label: string; classes: string }> = {
  confirmed: { label: 'confirmed', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  speculative: { label: 'speculative', classes: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  tbc: { label: 'tbc', classes: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  awaiting_budget_approval: { label: 'awaiting', classes: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  awaiting_payment: { label: 'awaiting payment', classes: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
  paid: { label: 'paid', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  remittance_received: { label: 'remittance', classes: 'bg-teal-50 text-teal-700 ring-teal-600/20' },
}

export const ForecastRow = memo(function ForecastRow({
  label, lines, periods, depth, isSubtotal, isTotal, isComputed, source, confidence, onCellSave, badge, title, readOnlyCells, lineStatus,
}: ForecastRowProps) {
  const rowClass = cn(
    isTotal && 'bg-zinc-900 text-white font-bold border-t-2 border-zinc-300',
    isSubtotal && 'bg-zinc-50 font-semibold border-t border-zinc-200',
    !isTotal && !isSubtotal && depthStyles[depth],
  )

  const paddingLeft = depth === 2 ? 'pl-10' : depth === 1 ? 'pl-6' : 'pl-3'

  return (
    <tr className={rowClass} title={title}>
      <td className={cn('sticky left-0 z-10 bg-inherit whitespace-nowrap py-1.5 pr-4 text-sm', paddingLeft)}>
        {source && (
          <span className={cn('mr-1.5 text-[8px]', sourceColors[source])}>●</span>
        )}
        {label}
        {depth === 2 && lineStatus && lineStatus !== 'none' && statusBadgeConfig[lineStatus] && (
          <span className={cn(
            'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ml-2',
            statusBadgeConfig[lineStatus].classes,
          )}>
            {statusBadgeConfig[lineStatus].label}
          </span>
        )}
        {badge}
        {confidence !== undefined && confidence < 100 && (
          <span className="ml-1.5 text-xs text-amber-600">{confidence}%</span>
        )}
      </td>
      {periods.map((p) => {
        const line = lines.get(p.id)
        const amount = line?.amount ?? 0

        return (
          <InlineCell
            key={p.id}
            value={amount}
            isNegative={amount < 0}
            isComputed={isComputed || isSubtotal || isTotal || depth === 0 || readOnlyCells}
            lineStatus={line?.lineStatus}
            onSave={(newAmount) => onCellSave?.(p.id, newAmount)}
          />
        )
      })}
    </tr>
  )
})

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

export function ForecastRow({
  label, lines, periods, depth, isSubtotal, isTotal, isComputed, source, confidence, onCellSave,
}: ForecastRowProps) {
  const rowClass = cn(
    isTotal && 'bg-zinc-900 text-white font-bold border-t-2 border-zinc-300',
    isSubtotal && 'bg-zinc-50 font-semibold border-t border-zinc-200',
    !isTotal && !isSubtotal && depthStyles[depth],
  )

  const paddingLeft = depth === 2 ? 'pl-10' : depth === 1 ? 'pl-6' : 'pl-3'

  return (
    <tr className={rowClass}>
      <td className={cn('sticky left-0 z-10 bg-inherit whitespace-nowrap py-1.5 pr-4 text-sm', paddingLeft)}>
        {source && (
          <span className={cn('mr-1.5 text-[8px]', sourceColors[source])}>●</span>
        )}
        {label}
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
            isComputed={isComputed || isSubtotal || isTotal || depth === 0}
            lineStatus={line?.lineStatus}
            onSave={(newAmount) => onCellSave?.(p.id, newAmount)}
          />
        )
      })}
    </tr>
  )
}

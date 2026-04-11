import { cn } from '@/lib/utils'
import { InlineCell } from './inline-cell'
import type { ForecastLine, Period, SourceType } from '@/lib/types'

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
  0: 'bg-[#1e1b4b] text-[#a5b4fc] font-semibold',
  1: 'text-text-secondary',
  2: '',
}

const sourceColors: Record<SourceType, string> = {
  manual: 'text-source-manual',
  document: 'text-source-document',
  recurring: 'text-source-recurring',
  pipeline: 'text-source-pipeline',
}

export function ForecastRow({
  label, lines, periods, depth, isSubtotal, isTotal, isComputed, source, confidence, onCellSave,
}: ForecastRowProps) {
  const rowClass = cn(
    isTotal && 'bg-[#1e1b4b] font-bold border-t-2 border-border-active',
    isSubtotal && 'bg-surface-raised font-semibold border-t border-border',
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
        {source === 'recurring' && <span className="ml-1 text-xs text-source-recurring">⟳</span>}
        {source === 'document' && <span className="ml-1 text-xs text-source-document">📎</span>}
        {confidence !== undefined && confidence < 100 && (
          <span className="ml-1.5 text-xs text-source-pipeline">{confidence}%</span>
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
            onSave={(newAmount) => onCellSave?.(p.id, newAmount)}
          />
        )
      })}
    </tr>
  )
}

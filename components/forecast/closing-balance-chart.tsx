'use client'

import { cn, formatCurrencyCompact } from '@/lib/utils'
import type { WeekSummary } from '@/lib/types'

interface ClosingBalanceChartProps {
  summaries: WeekSummary[]
}

export function ClosingBalanceChart({ summaries }: ClosingBalanceChartProps) {
  if (summaries.length === 0) return null

  const values = summaries.map((s) => s.closingBalance)
  const maxAbs = Math.max(...values.map(Math.abs), 1)

  function fmtDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">Closing Balance Trend</h3>
      <div className="bg-zinc-50 rounded-lg px-2 pb-1 pt-2">
        {/* Labels row */}
        <div className="flex gap-0.5 mb-1">
          {summaries.map((s, i) => {
            const isNeg = s.closingBalance < 0
            const opacity = i < 6 ? 1 : Math.max(0.15, 1 - (i - 5) * 0.12)
            return (
              <div key={s.periodId} className="flex-1 text-center" style={{ opacity }}>
                <span className={cn(
                  'text-[9px] font-medium tabular-nums',
                  isNeg ? 'text-blue-600' : 'text-emerald-600',
                )}>
                  {formatCurrencyCompact(s.closingBalance) || '—'}
                </span>
              </div>
            )
          })}
        </div>
        {/* Bars row */}
        <div className="h-28 flex items-end gap-0.5">
          {summaries.map((s, i) => {
            const heightPct = Math.max((Math.abs(s.closingBalance) / maxAbs) * 100, 2)
            const isNeg = s.closingBalance < 0
            const opacity = i < 6 ? 1 : Math.max(0.15, 1 - (i - 5) * 0.12)
            return (
              <div
                key={s.periodId}
                className={cn(
                  'flex-1 rounded-t transition-all',
                  isNeg
                    ? 'bg-gradient-to-t from-blue-600 to-blue-400'
                    : 'bg-gradient-to-t from-emerald-600 to-emerald-400',
                )}
                style={{ height: `${heightPct}%`, opacity }}
                title={`${fmtDate(s.weekEnding)}: ${new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(s.closingBalance)}`}
              />
            )
          })}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-zinc-400 mt-1 px-1">
        {summaries.length > 0 && <span>{fmtDate(summaries[0].weekEnding)}</span>}
        {summaries.length > 6 && <span>{fmtDate(summaries[Math.floor(summaries.length / 3)].weekEnding)}</span>}
        {summaries.length > 12 && <span>{fmtDate(summaries[Math.floor(summaries.length * 2 / 3)].weekEnding)}</span>}
        {summaries.length > 1 && <span>{fmtDate(summaries[summaries.length - 1].weekEnding)}</span>}
      </div>
    </div>
  )
}

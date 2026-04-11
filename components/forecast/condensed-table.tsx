'use client'

import { cn, formatCurrency } from '@/lib/utils'
import type { WeekSummary } from '@/lib/types'

interface CondensedTableProps {
  summaries: WeekSummary[]
  maxWeeks?: number
}

export function CondensedTable({ summaries, maxWeeks = 8 }: CondensedTableProps) {
  const visible = summaries.slice(0, maxWeeks)

  function fmtDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
  }

  function cell(value: number, colorClass: string) {
    return value !== 0
      ? { text: formatCurrency(value), cls: cn('font-medium', colorClass) }
      : { text: '—', cls: 'text-zinc-300' }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-900">Weekly Cash Flow</h3>
        <a href="/forecast/detail" className="text-sm text-blue-600 font-medium hover:text-blue-500">
          Full Detail &rarr;
        </a>
      </div>
      <table className="min-w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-zinc-950/5">
            <th className="py-2 pr-3 text-left text-xs font-medium text-zinc-500 w-36"></th>
            {visible.map((s) => (
              <th key={s.periodId} className="py-2 px-2 text-right text-xs font-medium text-zinc-400">
                {fmtDate(s.weekEnding)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-950/5">
            <td className="py-2 pr-3 text-zinc-600">Inflows</td>
            {visible.map((s) => {
              const c = cell(s.totalInflows, 'text-emerald-600')
              return <td key={s.periodId} className={cn('py-2 px-2 text-right', c.cls)}>{c.text}</td>
            })}
          </tr>
          <tr className="border-b border-zinc-950/5">
            <td className="py-2 pr-3 text-zinc-600">Outflows</td>
            {visible.map((s) => {
              const c = cell(s.totalOutflows, 'text-rose-600')
              return <td key={s.periodId} className={cn('py-2 px-2 text-right', c.cls)}>{c.text}</td>
            })}
          </tr>
          <tr className="border-b border-zinc-950/5">
            <td className="py-2 pr-3 text-zinc-600">Loans & Financing</td>
            {visible.map((s) => {
              const c = cell(s.loansAndFinancing, 'text-zinc-900')
              return <td key={s.periodId} className={cn('py-2 px-2 text-right', c.cls)}>{c.text}</td>
            })}
          </tr>
          <tr className="bg-zinc-900 text-white font-semibold">
            <td className="py-2.5 pr-3 pl-2.5 rounded-l-lg">Closing Balance</td>
            {visible.map((s, i) => (
              <td key={s.periodId} className={cn(
                'py-2.5 px-2 text-right',
                s.closingBalance < 0 ? 'text-rose-300' : 'text-white',
                i === visible.length - 1 && 'rounded-r-lg',
              )}>
                {formatCurrency(s.closingBalance)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 pr-3 text-zinc-600">Available (OD)</td>
            {visible.map((s) => (
              <td key={s.periodId} className="py-2 px-2 text-right text-emerald-600">
                {formatCurrency(s.availableCash)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

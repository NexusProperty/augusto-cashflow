'use client'

import { useState, Fragment } from 'react'
import { getMonthLabel } from '@/lib/pipeline/fiscal-year'
import { cn } from '@/lib/utils'
import type { BUSummaryRow } from '@/lib/pipeline/types'

interface SummaryTableProps {
  rows: BUSummaryRow[]
  months: string[]
}

function fmt(n: number): string {
  if (n === 0) return ''
  return n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })
}

function sumArray(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0)
}

function addArrays(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0))
}

function isAllZero(arr: number[]): boolean {
  return arr.every((v) => v === 0)
}

export function SummaryTable({ rows, months }: SummaryTableProps) {
  const colCount = months.length + 2 // label + N months + total

  // Default: collapsed if entity has all-zero data, expanded otherwise
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const row of rows) {
      const hasData = !isAllZero(row.totalForecast)
      init[row.entityId] = !hasData
    }
    return init
  })

  function toggleEntity(entityId: string) {
    setCollapsed((prev) => ({ ...prev, [entityId]: !prev[entityId] }))
  }

  // GROUP totals
  const groupConfirmedAndAwaiting = rows.reduce(
    (acc, r) => addArrays(acc, r.confirmedAndAwaiting),
    new Array(months.length).fill(0),
  )
  const groupUpcomingAndSpeculative = rows.reduce(
    (acc, r) => addArrays(acc, r.upcomingAndSpeculative),
    new Array(months.length).fill(0),
  )
  const groupTotalForecast = rows.reduce(
    (acc, r) => addArrays(acc, r.totalForecast),
    new Array(months.length).fill(0),
  )
  const groupTarget = rows.reduce(
    (acc, r) => addArrays(acc, r.target),
    new Array(months.length).fill(0),
  )
  const groupVariance = rows.reduce(
    (acc, r) => addArrays(acc, r.variance),
    new Array(months.length).fill(0),
  )
  const groupPnlForecast = rows.reduce(
    (acc, r) => addArrays(acc, r.pnlForecast),
    new Array(months.length).fill(0),
  )

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="sticky left-0 z-20 min-w-[200px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                Entity / Metric
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="bg-zinc-50 px-2.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-400"
                >
                  {getMonthLabel(m)}
                </th>
              ))}
              <th className="bg-zinc-50 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
                Total
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => {
              const isCollapsed = collapsed[row.entityId] ?? false
              return (
                <Fragment key={`entity-${row.entityId}`}>
                  {/* Entity header row — clickable, collapsible */}
                  <tr
                    className="bg-zinc-50 cursor-pointer hover:bg-zinc-100/80 transition-colors"
                    onClick={() => toggleEntity(row.entityId)}
                  >
                    <td
                      className="sticky left-0 z-10 bg-inherit px-3 py-2"
                      colSpan={colCount}
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          className={cn(
                            'w-3.5 h-3.5 transition-transform text-zinc-400',
                            isCollapsed && '-rotate-90',
                          )}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <span className="text-xs font-bold text-zinc-800">{row.entityName}</span>
                      </div>
                    </td>
                  </tr>

                  {!isCollapsed && (
                    <>
                      <SubRow label="Confirmed + Awaiting" values={row.confirmedAndAwaiting} />
                      <SubRow label="Upcoming & Speculative" values={row.upcomingAndSpeculative} />
                      <SubRow label="Total Forecast" values={row.totalForecast} bold />
                      <SubRow label="Target" values={row.target} />
                      <VarianceRow values={row.variance} />
                      <SubRow label="P&L Forecast" values={row.pnlForecast} italic />
                    </>
                  )}
                </Fragment>
              )
            })}

            {/* GROUP total section */}
            {rows.length > 1 && (
              <>
                <tr className="bg-zinc-50">
                  <td
                    className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-900"
                    colSpan={colCount}
                  >
                    GROUP TOTAL
                  </td>
                </tr>

                <SubRow label="Confirmed + Awaiting" values={groupConfirmedAndAwaiting} groupTotal />
                <SubRow label="Upcoming & Speculative" values={groupUpcomingAndSpeculative} groupTotal />
                <SubRow label="Total Forecast" values={groupTotalForecast} bold groupTotal />
                <SubRow label="Target" values={groupTarget} groupTotal />
                <VarianceRow values={groupVariance} groupTotal />
                <SubRow label="P&L Forecast" values={groupPnlForecast} italic groupTotal />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-row helper
// ---------------------------------------------------------------------------

function SubRow({
  label,
  values,
  bold = false,
  italic = false,
  groupTotal = false,
}: {
  label: string
  values: number[]
  bold?: boolean
  italic?: boolean
  groupTotal?: boolean
}) {
  const total = sumArray(values)
  const bgClass = groupTotal ? 'bg-zinc-50' : 'bg-white'
  return (
    <tr className="hover:bg-zinc-50/50">
      <td
        className={cn(
          'sticky left-0 z-10 px-3 py-1.5 pl-6 text-xs text-zinc-600 hover:bg-zinc-50/50',
          bgClass,
          bold && 'font-semibold',
          italic && 'italic',
        )}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            'px-2.5 py-1.5 text-right tabular-nums text-sm text-zinc-900',
            groupTotal && 'bg-zinc-50',
            bold && 'font-semibold',
            italic && 'italic',
          )}
        >
          {v === 0 ? (
            <span className="text-zinc-300">—</span>
          ) : (
            fmt(v)
          )}
        </td>
      ))}
      <td
        className={cn(
          'px-3 py-1.5 text-right tabular-nums text-sm text-zinc-900',
          groupTotal && 'bg-zinc-50',
          bold && 'font-semibold',
          italic && 'italic',
        )}
      >
        {total === 0 ? (
          <span className="text-zinc-300">—</span>
        ) : (
          fmt(total)
        )}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Variance row (colour-coded)
// ---------------------------------------------------------------------------

function VarianceRow({ values, groupTotal = false }: { values: number[]; groupTotal?: boolean }) {
  const total = sumArray(values)
  const bgClass = groupTotal ? 'bg-zinc-50' : 'bg-white'
  return (
    <tr className="hover:bg-zinc-50/50">
      <td
        className={cn(
          'sticky left-0 z-10 px-3 py-1.5 pl-6 text-xs text-zinc-600 hover:bg-zinc-50/50',
          bgClass,
        )}
      >
        Variance
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            'px-2.5 py-1.5 text-right tabular-nums text-sm',
            groupTotal && 'bg-zinc-50',
            v === 0 ? 'text-zinc-300' : v < 0 ? 'text-red-600' : 'text-emerald-600',
          )}
        >
          {v === 0 ? '—' : fmt(v)}
        </td>
      ))}
      <td
        className={cn(
          'px-3 py-1.5 text-right tabular-nums text-sm',
          groupTotal && 'bg-zinc-50',
          total === 0 ? 'text-zinc-300' : total < 0 ? 'text-red-600' : 'text-emerald-600',
        )}
      >
        {total === 0 ? '—' : fmt(total)}
      </td>
    </tr>
  )
}

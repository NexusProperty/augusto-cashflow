'use client'

import { getMonthLabel } from '@/lib/pipeline/fiscal-year'
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

export function SummaryTable({ rows, months }: SummaryTableProps) {
  const colCount = months.length + 2 // label + 12 months + total

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
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full min-w-[1200px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            <th className="sticky left-0 z-20 min-w-[200px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              Entity / Metric
            </th>
            {months.map((m) => (
              <th
                key={m}
                className="bg-zinc-50 px-2.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500"
              >
                {getMonthLabel(m)}
              </th>
            ))}
            <th className="bg-zinc-50 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">
              Total
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <>
              {/* Entity header row */}
              <tr key={`entity-${row.entityId}`} className="bg-zinc-50">
                <td
                  className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-800"
                  colSpan={colCount}
                >
                  {row.entityName}
                </td>
              </tr>

              {/* Confirmed + Awaiting */}
              <SubRow
                label="Confirmed + Awaiting"
                values={row.confirmedAndAwaiting}
              />

              {/* Upcoming & Speculative */}
              <SubRow
                label="Upcoming & Speculative"
                values={row.upcomingAndSpeculative}
              />

              {/* Total Forecast */}
              <SubRow
                label="Total Forecast"
                values={row.totalForecast}
                bold
              />

              {/* Target */}
              <SubRow
                label="Target"
                values={row.target}
              />

              {/* Variance */}
              <VarianceRow values={row.variance} />

              {/* P&L Forecast */}
              <SubRow
                label="P&L Forecast"
                values={row.pnlForecast}
                italic
              />
            </>
          ))}

          {/* GROUP total section */}
          {rows.length > 1 && (
            <>
              <tr className="bg-zinc-100">
                <td
                  className="sticky left-0 z-10 bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-900"
                  colSpan={colCount}
                >
                  GROUP TOTAL
                </td>
              </tr>

              <SubRow
                label="Confirmed + Awaiting"
                values={groupConfirmedAndAwaiting}
              />
              <SubRow
                label="Upcoming & Speculative"
                values={groupUpcomingAndSpeculative}
              />
              <SubRow
                label="Total Forecast"
                values={groupTotalForecast}
                bold
              />
              <SubRow
                label="Target"
                values={groupTarget}
              />
              <VarianceRow values={groupVariance} />
              <SubRow
                label="P&L Forecast"
                values={groupPnlForecast}
                italic
              />
            </>
          )}
        </tbody>
      </table>
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
}: {
  label: string
  values: number[]
  bold?: boolean
  italic?: boolean
}) {
  const total = sumArray(values)
  return (
    <tr className="hover:bg-zinc-50/50">
      <td
        className={`sticky left-0 z-10 bg-white px-3 py-1.5 pl-6 text-xs text-zinc-600 hover:bg-zinc-50/50 ${bold ? 'font-semibold' : ''} ${italic ? 'italic' : ''}`}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-2.5 py-1.5 text-right tabular-nums text-sm text-zinc-900 ${bold ? 'font-semibold' : ''} ${italic ? 'italic' : ''}`}
        >
          {v === 0 ? (
            <span className="text-zinc-300">—</span>
          ) : (
            fmt(v)
          )}
        </td>
      ))}
      <td
        className={`px-3 py-1.5 text-right tabular-nums text-sm text-zinc-900 ${bold ? 'font-semibold' : ''} ${italic ? 'italic' : ''}`}
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

function VarianceRow({ values }: { values: number[] }) {
  const total = sumArray(values)
  return (
    <tr className="hover:bg-zinc-50/50">
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 pl-6 text-xs text-zinc-600 hover:bg-zinc-50/50">
        Variance
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-2.5 py-1.5 text-right tabular-nums text-sm ${
            v === 0
              ? 'text-zinc-300'
              : v < 0
                ? 'text-red-600'
                : 'text-emerald-600'
          }`}
        >
          {v === 0 ? '—' : fmt(v)}
        </td>
      ))}
      <td
        className={`px-3 py-1.5 text-right tabular-nums text-sm ${
          total === 0
            ? 'text-zinc-300'
            : total < 0
              ? 'text-red-600'
              : 'text-emerald-600'
        }`}
      >
        {total === 0 ? '—' : fmt(total)}
      </td>
    </tr>
  )
}

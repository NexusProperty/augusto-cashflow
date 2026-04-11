'use client'

import { useTransition } from 'react'
import { ForecastRow } from './forecast-row'
import { Badge } from '@/components/ui/badge'
import { updateLineAmount } from '@/app/(app)/forecast/actions'
import { weekEndingLabel, formatCurrency } from '@/lib/utils'
import type { ForecastLine, Period, Category, WeekSummary } from '@/lib/types'

interface ForecastGridProps {
  periods: Period[]
  categories: Category[]
  lines: ForecastLine[]
  summaries: WeekSummary[]
}

export function ForecastGrid({ periods, categories, lines, summaries }: ForecastGridProps) {
  const [, startTransition] = useTransition()

  const linesByCategoryAndPeriod = new Map<string, Map<string, ForecastLine>>()
  for (const line of lines) {
    if (!linesByCategoryAndPeriod.has(line.categoryId)) {
      linesByCategoryAndPeriod.set(line.categoryId, new Map())
    }
    linesByCategoryAndPeriod.get(line.categoryId)!.set(line.periodId, line)
  }

  const summaryMap = new Map(summaries.map((s) => [s.periodId, s]))

  function handleCellSave(lineId: string, amount: number) {
    const fd = new FormData()
    fd.set('lineId', lineId)
    fd.set('amount', String(amount))
    startTransition(() => { updateLineAmount(fd) })
  }

  const sections = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> Confirmed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-sky-300 bg-sky-50" /> TBC</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-violet-300 bg-violet-50" /> Awaiting Payment</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-green-300 bg-green-100" /> Paid</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-teal-300 bg-teal-50" /> Remittance Received</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-rose-300 bg-rose-50" /> Speculative</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-orange-300 bg-orange-50" /> Awaiting Budget Approval</span>
      </div>
    <div className="overflow-x-auto rounded-b-lg border border-t-0 border-zinc-200">
      <table className="w-full min-w-[1200px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-zinc-200">
            <th className="sticky left-0 z-20 min-w-[280px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium text-zinc-500">
              Item / Description
            </th>
            {periods.map((p) => (
              <th key={p.id} className="bg-zinc-50 px-2.5 py-2.5 text-right text-xs font-medium text-zinc-500">
                {weekEndingLabel(new Date(p.weekEnding))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {sections.map((section) => {
            const children = categories
              .filter((c) => c.parentId === section.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)

            if (section.flowDirection === 'computed') return null

            return (
              <SectionBlock
                key={section.id}
                section={section}
                sectionChildren={children}
                categories={categories}
                linesByCategoryAndPeriod={linesByCategoryAndPeriod}
                periods={periods}
                lines={lines}
                onCellSave={handleCellSave}
              />
            )
          })}

          {/* Net Operating */}
          <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold">
            <td className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-sm text-zinc-900">Net Operating Cash Flow</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-2 text-right text-sm tabular-nums ${s && s.netOperating < 0 ? 'text-red-600' : 'text-zinc-900'}`}>
                  {s ? formatCurrency(s.netOperating) : '—'}
                </td>
              )
            })}
          </tr>
          {/* Closing Balance */}
          <tr className="border-t border-zinc-200 bg-zinc-900 font-bold text-white">
            <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2.5 text-sm">Closing Balance</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-2.5 text-right text-sm tabular-nums font-bold ${s && s.closingBalance < 0 ? 'text-red-400' : 'text-white'}`}>
                  {s ? formatCurrency(s.closingBalance) : '—'}
                </td>
              )
            })}
          </tr>
          {/* Available Cash */}
          <tr className="border-t border-zinc-200">
            <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-zinc-600">Available Cash (incl. OD)</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-1.5 text-right text-sm tabular-nums ${s && s.availableCash < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}`}>
                  {s ? formatCurrency(s.availableCash) : '—'}
                </td>
              )
            })}
          </tr>
          {/* OD Status */}
          <tr className="border-t border-zinc-100">
            <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-zinc-500">OD Status</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-1.5 text-right text-xs tabular-nums ${s?.isOverdrawn ? 'font-bold text-red-600' : 'text-emerald-600'}`}>
                  {s ? (s.isOverdrawn ? 'OVERDRAWN' : 'Within OD') : '—'}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
    </div>
  )
}

function SectionBlock({ section, sectionChildren, categories, linesByCategoryAndPeriod, periods, lines, onCellSave }: {
  section: Category
  sectionChildren: Category[]
  categories: Category[]
  linesByCategoryAndPeriod: Map<string, Map<string, ForecastLine>>
  periods: Period[]
  lines: ForecastLine[]
  onCellSave: (lineId: string, amount: number) => void
}) {
  return (
    <>
      <ForecastRow
        label={`${section.sectionNumber}. ${section.name}`}
        lines={new Map()}
        periods={periods}
        depth={0}
        isComputed
      />

      {sectionChildren.map((sub) => {
        return (
          <ForecastRow
            key={sub.id}
            label={`${sub.sectionNumber}. ${sub.name}`}
            lines={new Map()}
            periods={periods}
            depth={1}
            isComputed
          />
        )
      })}

      {lines
        .filter((l) => {
          const cat = categories.find((c) => c.id === l.categoryId)
          if (!cat) return false
          return cat.parentId === section.id || sectionChildren.some((sc) => sc.id === cat.parentId || sc.id === cat.id)
        })
        .map((line) => {
          const isPipeline = line.source === 'pipeline'
          return (
            <ForecastRow
              key={line.id}
              label={line.counterparty ?? line.notes ?? 'Line item'}
              lines={new Map([[line.periodId, line]])}
              periods={periods}
              depth={2}
              source={line.source}
              confidence={line.confidence}
              onCellSave={isPipeline ? undefined : (_periodId, amount) => onCellSave(line.id, amount)}
              readOnlyCells={isPipeline}
              badge={isPipeline ? <Badge variant="pipeline" className="ml-1.5">Pipeline</Badge> : undefined}
              title={isPipeline && line.counterparty ? line.counterparty : undefined}
            />
          )
        })
      }
    </>
  )
}

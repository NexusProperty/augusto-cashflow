'use client'

import { useTransition } from 'react'
import { ForecastRow } from './forecast-row'
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
    <div className="overflow-x-auto rounded-b-lg border border-t-0 border-border">
      <table className="w-full min-w-[1200px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-[280px] bg-surface-raised px-3 py-2 text-left text-xs font-medium text-text-muted">
              Item / Description
            </th>
            {periods.map((p) => (
              <th key={p.id} className="bg-surface-raised px-2.5 py-2 text-right text-xs font-medium text-text-muted">
                {weekEndingLabel(new Date(p.weekEnding))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
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

          {/* Computed summary rows */}
          <tr className="border-t-2 border-border-active bg-[#1e1b4b] font-bold">
            <td className="sticky left-0 z-10 bg-[#1e1b4b] px-3 py-2 text-sm">Net Operating Cash Flow</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-2 text-right text-sm ${s && s.netOperating < 0 ? 'text-negative' : ''}`}>
                  {s ? formatCurrency(s.netOperating) : '—'}
                </td>
              )
            })}
          </tr>
          <tr className="border-t-2 border-[#10b981] bg-[#042f2e] font-bold">
            <td className="sticky left-0 z-10 bg-[#042f2e] px-3 py-2 text-sm text-[#6ee7b7]">Closing Balance</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-2 text-right text-sm font-bold ${s && s.closingBalance < 0 ? 'text-negative' : 'text-[#6ee7b7]'}`}>
                  {s ? formatCurrency(s.closingBalance) : '—'}
                </td>
              )
            })}
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-sm text-text-secondary">Available Cash (incl. OD)</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-1.5 text-right text-sm ${s && s.availableCash < 0 ? 'text-negative' : 'text-positive'}`}>
                  {s ? formatCurrency(s.availableCash) : '—'}
                </td>
              )
            })}
          </tr>
          <tr>
            <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-sm text-text-secondary">OD Status</td>
            {periods.map((p) => {
              const s = summaryMap.get(p.id)
              return (
                <td key={p.id} className={`px-2.5 py-1.5 text-right text-xs ${s?.isOverdrawn ? 'font-bold text-negative' : 'text-positive'}`}>
                  {s ? (s.isOverdrawn ? '✖ OVERDRAWN' : '✔ Within OD') : '—'}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
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

      {/* Individual line items for this section */}
      {lines
        .filter((l) => {
          const cat = categories.find((c) => c.id === l.categoryId)
          if (!cat) return false
          // Direct child of section or child of a subsection under this section
          return cat.parentId === section.id || sectionChildren.some((sc) => sc.id === cat.parentId || sc.id === cat.id)
        })
        .map((line) => (
          <ForecastRow
            key={line.id}
            label={line.counterparty ?? line.notes ?? 'Line item'}
            lines={new Map([[line.periodId, line]])}
            periods={periods}
            depth={2}
            source={line.source}
            confidence={line.confidence}
            onCellSave={(_periodId, amount) => onCellSave(line.id, amount)}
          />
        ))
      }
    </>
  )
}

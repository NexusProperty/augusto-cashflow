'use client'

import { useTransition, useState, useCallback, useMemo, memo } from 'react'
import { ForecastRow } from './forecast-row'
import { Badge } from '@/components/ui/badge'
import { updateLineAmount } from '@/app/(app)/forecast/actions'
import { weekEndingLabel, formatCurrency, cn } from '@/lib/utils'
import type { ForecastLine, Period, Category, WeekSummary } from '@/lib/types'

interface ForecastGridProps {
  periods: Period[]
  categories: Category[]
  lines: ForecastLine[]
  summaries: WeekSummary[]
}

// Compute unique item rows for a section (grouped by categoryId + label)
function buildItemRows(
  section: Category,
  sectionChildren: Category[],
  categories: Category[],
  lines: ForecastLine[],
) {
  const sectionLines = lines.filter((l) => {
    const cat = categories.find((c) => c.id === l.categoryId)
    if (!cat) return false
    return (
      cat.parentId === section.id ||
      sectionChildren.some((sc) => sc.id === cat.parentId || sc.id === cat.id)
    )
  })

  // Group lines by item key (categoryId + label) — one logical row per unique item
  const itemMap = new Map<string, ForecastLine[]>()
  for (const l of sectionLines) {
    const label = l.counterparty ?? l.notes ?? 'Line item'
    const key = `${l.categoryId}::${label}`
    if (!itemMap.has(key)) itemMap.set(key, [])
    itemMap.get(key)!.push(l)
  }

  return { sectionLines, itemMap }
}

export function ForecastGrid({ periods, categories, lines, summaries }: ForecastGridProps) {
  const [, startTransition] = useTransition()

  const summaryMap = useMemo(() => new Map(summaries.map((s) => [s.periodId, s])), [summaries])

  const handleCellSave = useCallback((lineId: string, amount: number) => {
    const fd = new FormData()
    fd.set('lineId', lineId)
    fd.set('amount', String(amount))
    startTransition(() => { updateLineAmount(fd) })
  }, [startTransition])

  const sections = useMemo(
    () => categories
      .filter((c) => c.parentId === null && c.flowDirection !== 'computed')
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  )

  // Default collapsed: sections with no data start collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const sects = categories
      .filter((c) => c.parentId === null && c.flowDirection !== 'computed')
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const init: Record<string, boolean> = {}
    for (const section of sects) {
      const children = categories.filter((c) => c.parentId === section.id)
      const hasData = lines.some((l) => {
        if (l.amount === 0) return false
        const cat = categories.find((c) => c.id === l.categoryId)
        if (!cat) return false
        return (
          cat.parentId === section.id ||
          children.some((sc) => sc.id === cat.parentId || sc.id === cat.id)
        )
      })
      init[section.id] = !hasData
    }
    return init
  })

  const [hideEmpty, setHideEmpty] = useState(true)

  const toggleSection = useCallback((id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // Compute total hidden rows for the footer — memoized to avoid O(n*m) on every render
  const totalHiddenCount = useMemo(() => {
    if (!hideEmpty) return 0
    return sections.reduce((total, section) => {
      const children = categories
        .filter((c) => c.parentId === section.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const { itemMap } = buildItemRows(section, children, categories, lines)
      let hidden = 0
      for (const itemLines of itemMap.values()) {
        if (itemLines.every((l) => l.amount === 0)) hidden++
      }
      return total + hidden
    }, 0)
  }, [hideEmpty, sections, categories, lines])

  return (
    <div>
      {/* Controls bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> Confirmed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-sky-300 bg-sky-50" /> TBC
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-violet-300 bg-violet-50" /> Awaiting Payment
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-green-300 bg-green-100" /> Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-teal-300 bg-teal-50" /> Remittance Received
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-rose-300 bg-rose-50" /> Speculative
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-orange-300 bg-orange-50" /> Awaiting Budget Approval
          </span>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500 select-none">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 accent-blue-600"
          />
          Hide empty rows
        </label>
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
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                categories={categories}
                periods={periods}
                lines={lines}
                onCellSave={handleCellSave}
                collapsed={collapsed[section.id] ?? false}
                onToggle={toggleSection}
                hideEmpty={hideEmpty}
              />
            ))}

            {/* Net Operating */}
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold">
              <td className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-sm text-zinc-900">Net Operating Cash Flow</td>
              {periods.map((p) => {
                const s = summaryMap.get(p.id)
                return (
                  <td
                    key={p.id}
                    className={`px-2.5 py-2 text-right text-sm tabular-nums ${s && s.netOperating < 0 ? 'text-red-600' : 'text-zinc-900'}`}
                  >
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
                  <td
                    key={p.id}
                    className={`px-2.5 py-2.5 text-right text-sm tabular-nums font-bold ${s && s.closingBalance < 0 ? 'text-red-400' : 'text-white'}`}
                  >
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
                  <td
                    key={p.id}
                    className={`px-2.5 py-1.5 text-right text-sm tabular-nums ${s && s.availableCash < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}`}
                  >
                    {s ? formatCurrency(s.availableCash) : '—'}
                  </td>
                )
              })}
            </tr>

            {/* OD Status — badge pills */}
            <tr className="border-t border-zinc-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-zinc-500">OD Status</td>
              {periods.map((p) => {
                const s = summaryMap.get(p.id)
                const isOverdrawn = s?.isOverdrawn ?? false
                return (
                  <td key={p.id} className="px-2.5 py-1.5 text-right tabular-nums">
                    {s ? (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          isOverdrawn
                            ? 'bg-rose-50 text-rose-700 ring-rose-600/20'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
                        )}
                      >
                        {isOverdrawn ? 'OVERDRAWN' : 'Within OD'}
                      </span>
                    ) : '—'}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer bar */}
      {hideEmpty && (
        <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between text-[11px] text-zinc-400">
          <span>
            {totalHiddenCount} empty rows hidden —{' '}
            <button onClick={() => setHideEmpty(false)} className="text-blue-600 hover:underline">
              Show all rows
            </button>
          </span>
          <span>Showing weeks 1–{Math.min(periods.length, 18)} of {periods.length}</span>
        </div>
      )}
    </div>
  )
}

// ── Section colour config ────────────────────────────────────────────────────

function getSectionStyle(flowDirection: string) {
  switch (flowDirection) {
    case 'inflow':
      return {
        headerBg: 'bg-emerald-50/50',
        stickyBg: 'bg-emerald-50',
        textColor: 'text-emerald-700',
        chevronColor: 'text-emerald-500',
        totalColor: 'text-emerald-700',
      }
    case 'outflow':
      return {
        headerBg: 'bg-rose-50/40',
        stickyBg: 'bg-rose-50',
        textColor: 'text-rose-700',
        chevronColor: 'text-rose-400',
        totalColor: 'text-rose-700',
      }
    default:
      // balance / computed
      return {
        headerBg: 'bg-zinc-50/80',
        stickyBg: 'bg-zinc-50',
        textColor: 'text-zinc-700',
        chevronColor: 'text-zinc-400',
        totalColor: 'text-zinc-700',
      }
  }
}

// ── SectionBlock ─────────────────────────────────────────────────────────────

const SectionBlock = memo(function SectionBlock({
  section,
  categories,
  periods,
  lines,
  onCellSave,
  collapsed,
  onToggle,
  hideEmpty,
}: {
  section: Category
  categories: Category[]
  periods: Period[]
  lines: ForecastLine[]
  onCellSave: (lineId: string, amount: number) => void
  collapsed: boolean
  onToggle: (id: string) => void
  hideEmpty: boolean
}) {
  const style = getSectionStyle(section.flowDirection)

  const sectionChildren = useMemo(
    () => categories
      .filter((c) => c.parentId === section.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, section.id],
  )

  const { sectionLines, itemMap } = useMemo(
    () => buildItemRows(section, sectionChildren, categories, lines),
    [section, sectionChildren, categories, lines],
  )

  // Determine which item keys are all-zero across all periods
  const emptyKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const [key, itemLines] of itemMap) {
      if (itemLines.every((l) => l.amount === 0)) {
        keys.add(key)
      }
    }
    return keys
  }, [itemMap])

  const allZero = useMemo(
    () => sectionLines.every((l) => l.amount === 0),
    [sectionLines],
  )

  // Section totals per period column
  const sectionTotals = useMemo(
    () => periods.map((p) =>
      sectionLines
        .filter((l) => l.periodId === p.id)
        .reduce((sum, l) => sum + l.amount, 0),
    ),
    [periods, sectionLines],
  )

  // Build ordered item rows from the map (preserves insertion order = line order)
  const itemRows = useMemo(
    () => Array.from(itemMap.entries()).map(([key, itemLines]) => {
      const firstLine = itemLines[0]!
      const label = firstLine.counterparty ?? firstLine.notes ?? 'Line item'
      const lineMap = new Map(itemLines.map((l) => [l.periodId, l]))
      const isPipeline = firstLine.source === 'pipeline'
      return { key, label, lineMap, isPipeline, line: firstLine }
    }),
    [itemMap],
  )

  return (
    <>
      {/* Colour-coded collapsible section header */}
      <tr
        className={cn('cursor-pointer border-b border-zinc-200', style.headerBg)}
        onClick={() => onToggle(section.id)}
      >
        <td className={cn('sticky left-0 z-10 px-3 py-2', style.stickyBg)}>
          <div className="flex items-center gap-2">
            <svg
              className={cn(
                'w-3.5 h-3.5 transition-transform',
                style.chevronColor,
                collapsed && '-rotate-90',
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className={cn('text-xs font-semibold uppercase tracking-wide', style.textColor)}>
              {section.sectionNumber ? `${section.sectionNumber}. ${section.name}` : section.name}
            </span>
            {allZero && (
              <span className="text-[10px] font-normal text-zinc-400 normal-case tracking-normal">
                (no items)
              </span>
            )}
          </div>
        </td>
        {sectionTotals.map((total, i) => (
          <td
            key={periods[i]!.id}
            className={cn('px-2.5 py-2 text-right text-xs font-semibold tabular-nums', style.totalColor)}
          >
            {total !== 0 ? formatCurrency(total) : '—'}
          </td>
        ))}
      </tr>

      {/* Sub-section label rows + data rows — only when not collapsed */}
      {!collapsed && (
        <>
          {sectionChildren.map((sub) => {
            // Compute sub-section totals: sum lines belonging to this sub-section per period
            const subLines = sectionLines.filter((l) => {
              const cat = categories.find((c) => c.id === l.categoryId)
              if (!cat) return false
              return cat.parentId === sub.id || cat.id === sub.id
            })
            const subLineMap = new Map<string, ForecastLine>()
            for (const period of periods) {
              const periodTotal = subLines
                .filter((l) => l.periodId === period.id)
                .reduce((sum, l) => sum + l.amount, 0)
              if (periodTotal !== 0) {
                // Synthesize a virtual line for totalling purposes
                subLineMap.set(period.id, {
                  id: `sub-total-${sub.id}-${period.id}`,
                  entityId: '',
                  periodId: period.id,
                  categoryId: sub.id,
                  amount: periodTotal,
                  counterparty: null,
                  notes: null,
                  source: 'manual',
                  confidence: 100,
                  sourceDocumentId: null,
                  sourceRuleId: null,
                  lineStatus: 'none',
                })
              }
            }
            return (
              <ForecastRow
                key={sub.id}
                label={sub.sectionNumber ? `${sub.sectionNumber}. ${sub.name}` : sub.name}
                lines={subLineMap}
                periods={periods}
                depth={1}
                isComputed
              />
            )
          })}

          {itemRows.map(({ key, label, lineMap, isPipeline, line }) => {
            if (hideEmpty && emptyKeys.has(key)) return null
            return (
              <ForecastRow
                key={key}
                label={label}
                lines={lineMap}
                periods={periods}
                depth={2}
                source={line.source}
                confidence={line.confidence}
                lineStatus={line.lineStatus}
                onCellSave={
                  isPipeline
                    ? undefined
                    : (periodId, amount) => {
                        const targetLine = lineMap.get(periodId)
                        if (targetLine) onCellSave(targetLine.id, amount)
                      }
                }
                readOnlyCells={isPipeline}
                badge={
                  isPipeline
                    ? <Badge variant="pipeline" className="ml-1.5">Pipeline</Badge>
                    : undefined
                }
                title={isPipeline && line.counterparty ? line.counterparty : undefined}
              />
            )
          })}
        </>
      )}
    </>
  )
})

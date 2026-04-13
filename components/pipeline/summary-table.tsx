'use client'

import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react'
import { getMonthLabel } from '@/lib/pipeline/fiscal-year'
import { cn } from '@/lib/utils'
import type { BUSummaryRow } from '@/lib/pipeline/types'
import {
  buildFlatSummaryRows,
  METRIC_ROWS,
  type FlatSummaryRow,
  type SummaryMetricKey,
} from '@/lib/pipeline/summary-flat-rows'
import {
  forEachCellInRange,
  jumpToEdge,
  type Selection,
  type CellRef,
} from '@/lib/pipeline/summary-selection'
import { useSummaryGridState } from '@/lib/pipeline/use-summary-grid-state'
import { useSummaryExport } from '@/lib/pipeline/use-summary-export'
import { MetricRow } from './summary-table-rows'
import { computeAggregates } from '@/lib/forecast/aggregates'
import { SummarySelectionStats } from './summary-selection-stats'
import { SummaryFindBar } from './summary-find-bar'

interface SummaryTableProps {
  rows: BUSummaryRow[]
  months: string[]
  fiscalYear?: number
}

function isAllZero(arr: number[]): boolean {
  return arr.every((v) => v === 0)
}

export function SummaryTable({ rows, months, fiscalYear }: SummaryTableProps) {
  const colCount = months.length + 2 // label + N months + total
  const selectableColCount = months.length + 1
  const totalColIndex = months.length

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const row of rows) {
      const hasData = !isAllZero(row.totalForecast)
      init[row.entityId] = !hasData
    }
    return init
  })

  const [selection, setSelection] = useState<Selection | null>(null)
  const isDraggingRef = useRef(false)
  const tableWrapperRef = useRef<HTMLDivElement>(null)

  // ── Find state (hook owns flatRows + flatRowIndex so effectiveCollapsed stays internal) ──
  const {
    findOpen,
    findQuery,
    setFindQuery,
    matches,
    findCursor,
    currentMatchCellKey,
    otherMatchCells,
    flashOn,
    openFind,
    closeFind: closeFindInternal,
    findNext,
    findPrev,
    onlyMatching,
    setOnlyMatching,
    matchedEntities,
    effectiveCollapsed,
    flatRows,
    flatRowIndex,
  } = useSummaryGridState({
    rows,
    months,
    collapsed,
    setCollapsed,
    setSelection,
  })

  const flatRowCount = flatRows.length

  const closeFind = useCallback(() => {
    closeFindInternal()
    tableWrapperRef.current?.focus()
  }, [closeFindInternal])

  // ── Export state ────────────────────────────────────────────────────
  const {
    exportOpen,
    setExportOpen,
    exportBtnRef,
    exportContainerRef,
    handleExport,
    closeExport,
  } = useSummaryExport({
    rows,
    flatRows,
    months,
    selection,
    collapsed: effectiveCollapsed,
    fiscalYear,
  })

  const toggleEntity = useCallback((entityId: string) => {
    setCollapsed((prev) => ({ ...prev, [entityId]: !prev[entityId] }))
    setSelection(null)
  }, [])

  useEffect(() => {
    function onMouseUp() {
      isDraggingRef.current = false
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  const handleCellMouseDown = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      setSelection((prev) => {
        if (e.shiftKey && prev) {
          return { anchor: prev.anchor, focus: { row, col } }
        }
        return { anchor: { row, col }, focus: { row, col } }
      })
      isDraggingRef.current = true
      tableWrapperRef.current?.focus()
      e.preventDefault()
    },
    [],
  )

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (!isDraggingRef.current) return
    setSelection((prev) => (prev ? { ...prev, focus: { row, col } } : prev))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd+F — open find (takes precedence over Ctrl+End etc.).
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        e.stopPropagation()
        openFind()
        return
      }

      if (flatRowCount === 0) return

      if (e.key === 'Escape') {
        if (selection) {
          setSelection(null)
          e.preventDefault()
        }
        return
      }

      if (!selection) {
        if (
          e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
          e.key === 'Home' || e.key === 'End'
        ) {
          setSelection({ anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } })
          e.preventDefault()
        }
        return
      }

      const shift = e.shiftKey
      const ctrl = e.ctrlKey || e.metaKey
      const { anchor, focus } = selection
      const lastRow = flatRowCount - 1
      const lastCol = selectableColCount - 1

      const setFocus = (next: CellRef) => {
        setSelection({
          anchor: shift ? anchor : { row: next.row, col: next.col },
          focus: next,
        })
      }

      const arrowKey = (
        { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
      )[e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight']

      if (arrowKey) {
        e.preventDefault()
        if (ctrl) {
          const next = jumpToEdge(arrowKey, focus, flatRowCount, selectableColCount)
          setFocus(next)
          return
        }
        let nr = focus.row
        let nc = focus.col
        if (arrowKey === 'up') nr = Math.max(0, focus.row - 1)
        else if (arrowKey === 'down') nr = Math.min(lastRow, focus.row + 1)
        else if (arrowKey === 'left') nc = Math.max(0, focus.col - 1)
        else if (arrowKey === 'right') nc = Math.min(lastCol, focus.col + 1)
        setFocus({ row: nr, col: nc })
        return
      }

      if (e.key === 'Home' && ctrl) {
        e.preventDefault()
        setFocus({ row: 0, col: 0 })
        return
      }
      if (e.key === 'End' && ctrl) {
        e.preventDefault()
        setFocus({ row: lastRow, col: totalColIndex })
        return
      }
      if (e.key === 'F3') {
        e.preventDefault()
        if (findOpen) {
          if (e.shiftKey) findPrev()
          else findNext()
        }
        return
      }
    },
    [selection, flatRowCount, selectableColCount, totalColIndex, findOpen, findNext, findPrev, openFind],
  )

  // GROUP totals for display.
  const groupTotalsForRender = useMemo(() => {
    const get = (k: SummaryMetricKey): number[] => {
      const idx = flatRowIndex.groupTotal.get(k)
      return idx !== undefined ? flatRows[idx]!.values : new Array(months.length).fill(0)
    }
    const result: Record<SummaryMetricKey, number[]> = {
      confirmedAndAwaiting: get('confirmedAndAwaiting'),
      upcomingAndSpeculative: get('upcomingAndSpeculative'),
      totalForecast: get('totalForecast'),
      target: get('target'),
      variance: get('variance'),
      pnlForecast: get('pnlForecast'),
    }
    return result
  }, [flatRowIndex, flatRows, months.length])

  const selectionAggregates = useMemo(() => {
    if (!selection) return null
    const values: number[] = []
    forEachCellInRange(selection, months.length, (row, col, isTotalCol) => {
      const fr = flatRows[row]
      if (!fr) return
      if (isTotalCol) {
        let total = 0
        for (const v of fr.values) total += v
        values.push(total)
      } else if (col < months.length) {
        values.push(fr.values[col] ?? 0)
      }
    })
    if (values.length < 2) return null
    return computeAggregates(values)
  }, [selection, flatRows, months.length])

  function resolveFlatRow(entityId: string | null, metricKey: SummaryMetricKey): number | null {
    if (entityId === null) {
      return flatRowIndex.groupTotal.get(metricKey) ?? null
    }
    return flatRowIndex.byEntity.get(entityId)?.get(metricKey) ?? null
  }

  // Whether to show entity header (hide when onlyMatching and no match for it).
  const shouldShowEntity = (entityId: string): boolean => {
    if (!findOpen || !onlyMatching) return true
    return matchedEntities.has(entityId)
  }
  const shouldShowGroupTotal = (): boolean => {
    if (!findOpen || !onlyMatching) return true
    return matchedEntities.has('__group_total__')
  }

  // Dropdown keydown — Esc closes and returns focus to trigger.
  const handleExportMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeExport()
    }
  }

  return (
    <div
      ref={tableWrapperRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="bg-white rounded-xl border border-zinc-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-200 min-h-[44px]">
        <div className="flex items-center gap-2">
          {findOpen ? (
            <SummaryFindBar
              query={findQuery}
              total={matches.length}
              currentIndex={findCursor}
              onlyMatching={onlyMatching}
              onQueryChange={setFindQuery}
              onNext={findNext}
              onPrev={findPrev}
              onClose={closeFind}
              onOnlyMatchingChange={setOnlyMatching}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={openFind}
                title="Find (Ctrl+F)"
                className="flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                </svg>
                Find
              </button>
              <div ref={exportContainerRef} className="relative">
                <button
                  ref={exportBtnRef}
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  title="Export CSV"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                  className="flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Export CSV
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {exportOpen && (
                  <div
                    role="menu"
                    onKeyDown={handleExportMenuKeyDown}
                    className="absolute left-0 top-full z-30 mt-1 w-60 rounded border border-zinc-200 bg-white py-1 text-xs shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleExport('all')}
                      className="block w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50"
                    >
                      All entities × all months
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleExport('view')}
                      className="block w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50"
                    >
                      Current view (respects collapsed)
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!selection}
                      onClick={() => handleExport('selection')}
                      className="block w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-white"
                    >
                      Selection
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SummarySelectionStats aggregates={selectionAggregates} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table
          role="grid"
          aria-label="Pipeline summary"
          aria-rowcount={flatRowCount}
          aria-colcount={colCount}
          className="w-full min-w-[1200px] border-collapse text-sm"
        >
          <thead>
            <tr role="row" className="border-b border-zinc-200 bg-zinc-50">
              <th role="columnheader" className="sticky left-0 z-20 min-w-[200px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                Entity / Metric
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  role="columnheader"
                  className="bg-zinc-50 px-2.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-400"
                >
                  {getMonthLabel(m)}
                </th>
              ))}
              <th role="columnheader" className="bg-zinc-50 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-400">
                Total
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => {
              if (!shouldShowEntity(row.entityId)) return null
              const isCollapsed = effectiveCollapsed[row.entityId] ?? false
              return (
                <Fragment key={`entity-${row.entityId}`}>
                  <tr
                    role="row"
                    className="bg-zinc-50 cursor-pointer hover:bg-zinc-100/80 transition-colors"
                    onClick={() => toggleEntity(row.entityId)}
                  >
                    <td
                      role="rowheader"
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

                  {!isCollapsed && METRIC_ROWS.map((spec) => {
                    const fr = resolveFlatRow(row.entityId, spec.metricKey)
                    return (
                      <MetricRow
                        key={spec.metricKey}
                        spec={spec}
                        values={row[spec.metricKey]}
                        flatRow={fr}
                        selection={selection}
                        onMouseDown={handleCellMouseDown}
                        onMouseEnter={handleCellMouseEnter}
                        currentMatchCellKey={currentMatchCellKey}
                        flashOn={flashOn}
                        otherMatchCells={otherMatchCells}
                      />
                    )
                  })}
                </Fragment>
              )
            })}

            {rows.length > 1 && shouldShowGroupTotal() && (
              <>
                <tr role="row" className="bg-zinc-50">
                  <td
                    role="rowheader"
                    className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-900"
                    colSpan={colCount}
                  >
                    GROUP TOTAL
                  </td>
                </tr>
                {METRIC_ROWS.map((spec) => (
                  <MetricRow
                    key={spec.metricKey}
                    spec={spec}
                    values={groupTotalsForRender[spec.metricKey]}
                    groupTotal
                    flatRow={resolveFlatRow(null, spec.metricKey)}
                    selection={selection}
                    onMouseDown={handleCellMouseDown}
                    onMouseEnter={handleCellMouseEnter}
                    currentMatchCellKey={currentMatchCellKey}
                    flashOn={flashOn}
                    otherMatchCells={otherMatchCells}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { buildFlatSummaryRows }
export type { FlatSummaryRow }

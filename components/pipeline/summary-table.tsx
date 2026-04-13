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
  jumpToEdge,
  type Selection,
  type CellRef,
} from '@/lib/pipeline/summary-selection'
import { MetricRow } from './summary-table-rows'

interface SummaryTableProps {
  rows: BUSummaryRow[]
  months: string[]
}

function isAllZero(arr: number[]): boolean {
  return arr.every((v) => v === 0)
}

export function SummaryTable({ rows, months }: SummaryTableProps) {
  const colCount = months.length + 2 // label + N months + total
  // Selectable cols: months + virtual Total = months.length + 1
  const selectableColCount = months.length + 1
  const totalColIndex = months.length

  // Default: collapsed if entity has all-zero data, expanded otherwise
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

  const flatRows = useMemo(() => buildFlatSummaryRows(rows, collapsed), [rows, collapsed])
  const flatRowCount = flatRows.length

  const toggleEntity = useCallback((entityId: string) => {
    setCollapsed((prev) => ({ ...prev, [entityId]: !prev[entityId] }))
    // Selection coordinates reference the flat-row index, which shifts on
    // expand/collapse — simplest to clear.
    setSelection(null)
  }, [])

  // Window-level mouseup ends drag (even if released outside the table).
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
      // Focus the wrapper so keyboard nav works immediately.
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
      if (flatRowCount === 0) return

      if (e.key === 'Escape') {
        if (selection) {
          setSelection(null)
          e.preventDefault()
        }
        return
      }

      // If no selection yet, first arrow key starts at (0, 0).
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
    },
    [selection, flatRowCount, selectableColCount, totalColIndex],
  )

  // Build a lookup: entityId + metricKey → visible flat row index.
  const flatRowIndex = useMemo(() => {
    const byEntity = new Map<string, Map<SummaryMetricKey, number>>()
    const groupTotal = new Map<SummaryMetricKey, number>()
    flatRows.forEach((fr, i) => {
      if (fr.kind === 'entity-metric' && fr.entityId) {
        let inner = byEntity.get(fr.entityId)
        if (!inner) {
          inner = new Map()
          byEntity.set(fr.entityId, inner)
        }
        inner.set(fr.metricKey, i)
      } else if (fr.kind === 'group-total-metric') {
        groupTotal.set(fr.metricKey, i)
      }
    })
    return { byEntity, groupTotal }
  }, [flatRows])

  // GROUP totals for display (mirror of what's in flatRows).
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

  // Helper: given an entity or group-total row kind + metric key, resolve the
  // flat row index (or null if not visible / collapsed).
  function resolveFlatRow(entityId: string | null, metricKey: SummaryMetricKey): number | null {
    if (entityId === null) {
      return flatRowIndex.groupTotal.get(metricKey) ?? null
    }
    return flatRowIndex.byEntity.get(entityId)?.get(metricKey) ?? null
  }

  return (
    <div
      ref={tableWrapperRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="bg-white rounded-xl border border-zinc-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
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
                  {/* Entity header row — clickable, collapsible (NOT selectable) */}
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

                  {!isCollapsed && METRIC_ROWS.map((spec) => (
                    <MetricRow
                      key={spec.metricKey}
                      spec={spec}
                      values={row[spec.metricKey]}
                      flatRow={resolveFlatRow(row.entityId, spec.metricKey)}
                      selection={selection}
                      onMouseDown={handleCellMouseDown}
                      onMouseEnter={handleCellMouseEnter}
                    />
                  ))}
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

// Expose for downstream tasks (stats, find, export) — see plan.
export { buildFlatSummaryRows }
export type { FlatSummaryRow }

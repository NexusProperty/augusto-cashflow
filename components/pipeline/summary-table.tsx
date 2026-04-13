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
  normalizeRange,
  type Selection,
  type CellRef,
} from '@/lib/pipeline/summary-selection'
import {
  buildMatchList,
  nextMatchIndex,
  prevMatchIndex,
  type FindMatch,
} from '@/lib/pipeline/summary-find'
import { MetricRow } from './summary-table-rows'
import { computeAggregates } from '@/lib/forecast/aggregates'
import { SummarySelectionStats } from './summary-selection-stats'
import { SummaryFindBar } from './summary-find-bar'
import { buildSummaryCsv } from '@/lib/pipeline/export-summary'

interface SummaryTableProps {
  rows: BUSummaryRow[]
  months: string[]
  fiscalYear?: number
}

type ExportScope = 'all' | 'view' | 'selection'

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

  // ── Export dropdown state ───────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (!exportRef.current) return
      if (!exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [exportOpen])

  // ── Find state ──────────────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findCursor, setFindCursor] = useState<number | null>(null)
  const [onlyMatching, setOnlyMatching] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerFlash = useCallback(() => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    setFlashOn(true)
    flashTimeoutRef.current = setTimeout(() => {
      setFlashOn(false)
      flashTimeoutRef.current = null
    }, 500)
  }, [])

  // Fully-expanded flat rows — used ONLY as the search corpus so collapsed
  // entities are still findable.
  const expandedFlatRows = useMemo(
    () => buildFlatSummaryRows(rows, {}),
    [rows],
  )

  const matches = useMemo<FindMatch[]>(
    () => (findOpen ? buildMatchList(expandedFlatRows, months.length, findQuery) : []),
    [findOpen, expandedFlatRows, months.length, findQuery],
  )

  // Set of entityIds (+ 'group-total' sentinel) that have at least one match —
  // used for "Only matching rows" filtering.
  const matchedEntities = useMemo(() => {
    const s = new Set<string>()
    for (const m of matches) {
      const fr = expandedFlatRows[m.row]
      if (!fr) continue
      s.add(fr.entityId ?? '__group_total__')
    }
    return s
  }, [matches, expandedFlatRows])

  // Effective display rows: respect collapsed, optionally filter by matches.
  const effectiveCollapsed = useMemo(() => {
    if (!findOpen || !onlyMatching) return collapsed
    // Force-collapse any entity that has no matches.
    const out: Record<string, boolean> = { ...collapsed }
    for (const r of rows) {
      if (!matchedEntities.has(r.entityId)) out[r.entityId] = true
      else out[r.entityId] = false
    }
    return out
  }, [findOpen, onlyMatching, collapsed, rows, matchedEntities])

  const flatRows = useMemo(
    () => buildFlatSummaryRows(rows, effectiveCollapsed),
    [rows, effectiveCollapsed],
  )
  const flatRowCount = flatRows.length

  // Display-row lookup: entityId + metricKey → display flat-row index.
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

  // Map a match (addressing expandedFlatRows) to a display-list (row, col) —
  // returns null if the match's row is not currently visible.
  const resolveMatchDisplay = useCallback(
    (m: FindMatch): { row: number; col: number | null; entityId: string | null } | null => {
      const fr = expandedFlatRows[m.row]
      if (!fr) return null
      const idx = fr.entityId
        ? flatRowIndex.byEntity.get(fr.entityId)?.get(fr.metricKey) ?? null
        : flatRowIndex.groupTotal.get(fr.metricKey) ?? null
      if (idx === null) return null
      return { row: idx, col: m.col, entityId: fr.entityId }
    },
    [expandedFlatRows, flatRowIndex],
  )

  // Current match (display coords) — for flash + scroll-into-view.
  const currentDisplayMatch = useMemo(() => {
    if (!findOpen || findCursor === null || matches.length === 0) return null
    const m = matches[findCursor]
    if (!m) return null
    return resolveMatchDisplay(m)
  }, [findOpen, findCursor, matches, resolveMatchDisplay])

  // Other matches in display coords — pale yellow ring.
  const otherMatchCells = useMemo(() => {
    if (!findOpen) return new Set<string>()
    const s = new Set<string>()
    matches.forEach((m, i) => {
      if (i === findCursor) return
      const d = resolveMatchDisplay(m)
      if (!d || d.col === null) return
      s.add(`${d.row}:${d.col}`)
    })
    return s
  }, [findOpen, matches, findCursor, resolveMatchDisplay])

  // For row-level matches (col === null), highlight the first data cell (col 0)
  // to match selection-jump behavior.
  const currentMatchCellKey = currentDisplayMatch
    ? `${currentDisplayMatch.row}:${currentDisplayMatch.col ?? 0}`
    : null

  // Reset cursor when matches list changes meaningfully.
  useEffect(() => {
    if (!findOpen) {
      setFindCursor(null)
      return
    }
    if (matches.length === 0) {
      setFindCursor(null)
    } else if (findCursor === null || findCursor >= matches.length) {
      setFindCursor(0)
    }
  }, [findOpen, matches.length, findCursor])

  // ── Find navigation ─────────────────────────────────────────────────
  // Cursor changes drive expand + flash via the cursor-change effect below.
  // We also fire triggerFlash() here so that re-navigating to the same cursor
  // (e.g. F3 with a single match) still pulses.
  const jumpToCursor = useCallback(
    (cursor: number) => {
      setFindCursor(cursor)
      triggerFlash()
    },
    [triggerFlash],
  )

  // After display-list updates, sync selection + scroll-into-view.
  useEffect(() => {
    if (!currentDisplayMatch) return
    const { row, col } = currentDisplayMatch
    const cellCol = col === null ? 0 : col
    setSelection({
      anchor: { row, col: cellCol },
      focus: { row, col: cellCol },
    })
  }, [currentDisplayMatch])

  const findNext = useCallback(() => {
    if (matches.length === 0) return
    const nx = nextMatchIndex(findCursor, matches.length)
    jumpToCursor(nx)
  }, [matches.length, findCursor, jumpToCursor])

  const findPrev = useCallback(() => {
    if (matches.length === 0) return
    const nx = prevMatchIndex(findCursor, matches.length)
    jumpToCursor(nx)
  }, [matches.length, findCursor, jumpToCursor])

  const openFind = useCallback(() => {
    setFindOpen(true)
  }, [])

  // ── Export handler ──────────────────────────────────────────────────
  const handleExport = useCallback(
    (scope: ExportScope) => {
      let csv: string
      if (scope === 'selection') {
        if (!selection) return
        csv = buildSummaryCsv({ flatRows, months, selection, scope: 'selection' })
      } else {
        csv = buildSummaryCsv({
          rows,
          months,
          scope,
          collapsed: scope === 'view' ? effectiveCollapsed : undefined,
        })
      }
      const fy = fiscalYear ?? (months[0] ? parseInt(months[0].slice(0, 4), 10) + 1 : 0)
      const fyLabel = fy ? `FY${String(fy).slice(-2)}` : 'FY'
      const filename = `pipeline-summary-${fyLabel}-${scope}.csv`
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportOpen(false)
    },
    [rows, months, fiscalYear, flatRows, selection, effectiveCollapsed],
  )

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindQuery('')
    setFindCursor(null)
    setOnlyMatching(false)
    setSelection(null)
    tableWrapperRef.current?.focus()
  }, [])

  // Whenever the cursor lands on a match (manual nav OR auto on query change),
  // expand the target entity if collapsed and fire the flash pulse.
  useEffect(() => {
    if (!findOpen) return
    if (findCursor === null) return
    const m = matches[findCursor]
    if (!m) return
    const fr = expandedFlatRows[m.row]
    if (!fr) return
    if (fr.entityId && collapsed[fr.entityId]) {
      setCollapsed((prev) => ({ ...prev, [fr.entityId!]: false }))
    }
    triggerFlash()
    // Intentionally depend on cursor + matches only — we don't want to re-fire
    // on collapsed changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, findCursor, matches])

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

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    }
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
        setFindOpen(true)
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
    [selection, flatRowCount, selectableColCount, totalColIndex, findOpen, findNext, findPrev],
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
    const r = normalizeRange(selection)
    const values: number[] = []
    for (let row = r.rowStart; row <= r.rowEnd; row++) {
      const fr = flatRows[row]
      if (!fr) continue
      for (let col = r.colStart; col <= r.colEnd; col++) {
        if (col < months.length) {
          values.push(fr.values[col] ?? 0)
        } else if (col === months.length) {
          let total = 0
          for (const v of fr.values) total += v
          values.push(total)
        }
      }
    }
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
              <div ref={exportRef} className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  title="Export CSV"
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
                  <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded border border-zinc-200 bg-white py-1 text-xs shadow-lg">
                    <button
                      type="button"
                      onClick={() => handleExport('all')}
                      className="block w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50"
                    >
                      All entities × all months
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('view')}
                      className="block w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50"
                    >
                      Current view (respects collapsed)
                    </button>
                    <button
                      type="button"
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
              if (!shouldShowEntity(row.entityId)) return null
              const isCollapsed = effectiveCollapsed[row.entityId] ?? false
              return (
                <Fragment key={`entity-${row.entityId}`}>
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

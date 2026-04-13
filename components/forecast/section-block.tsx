'use client'

import { useMemo, memo } from 'react'
import { ForecastRow } from './forecast-row'
import { InlineCell } from './inline-cell'
import { Badge } from '@/components/ui/badge'
import { buildItemRows, type FlatRow, type RowGroupMap } from '@/lib/forecast/flat-rows'
import { isInRange } from '@/lib/forecast/selection'
import { isInFillRange } from '@/lib/forecast/fill-handle'
import { formatCurrency, cn } from '@/lib/utils'
import type { ForecastLine, Period, Category } from '@/lib/types'
import type { Direction } from './inline-cell-keys'
import { freezeCellStyle } from './forecast-grid'

// ── Section-style helper ──────────────────────────────────────────────────────
// Maps a section's flowDirection to its colour-scheme token set.

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

export const SectionBlock = memo(function SectionBlock({
  section,
  categories,
  periods,
  lines,
  flatRows,
  focus,
  range,
  anchor,
  extraSelected,
  onCellSave,
  onCellClear,
  onCellCreate,
  onSubtotalSave,
  onMoveFocus,
  collapsed,
  onToggle,
  hideEmpty,
  overriddenSet,
  overrideScenarioLabel,
  fillPreviewRange,
  onFillStart,
  onFillDoubleClick,
  filterRowSet,
  highlightCell,
  freezeCount = 0,
  onSplitCellOpen,
  groups,
  onToggleGroup,
  onUngroup,
}: {
  section: Category
  categories: Category[]
  periods: Period[]
  lines: ForecastLine[]
  flatRows: FlatRow[]
  focus: { row: number; col: number } | null
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null
  anchor: { row: number; col: number } | null
  extraSelected: Set<string>
  onCellSave: (lineId: string, amount: number, formula?: string | null) => void
  onCellClear: (lineId: string) => void
  onCellCreate: (template: ForecastLine, periodId: string, amount: number) => void
  onSubtotalSave: (subCategoryIds: string[], periodId: string, newTotal: number) => void
  onMoveFocus: (row: number, col: number, direction: Direction) => void
  collapsed: boolean
  onToggle: (id: string) => void
  hideEmpty: boolean
  overriddenSet?: Set<string>
  overrideScenarioLabel?: string
  fillPreviewRange: { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null
  onFillStart: () => void
  onFillDoubleClick: () => void
  /** When "only matching rows" is active, a Set of flat-row indexes to show. */
  filterRowSet?: Set<number> | null
  /** Flat-row index + col of the currently highlighted find match (500 ms flash). */
  highlightCell?: { row: number; col: number } | null
  /** Number of week columns to freeze (0 = off). Propagated from ForecastGrid. */
  freezeCount?: number
  /** Right-click handler for item cells — opens the split-cell modal. */
  onSplitCellOpen?: (
    e: React.MouseEvent,
    line: ForecastLine | undefined,
    periodId: string,
    colIdx: number,
    lineByPeriod: Map<string, ForecastLine>,
    isPipeline: boolean,
  ) => void
  /** P3.4: user-defined row groups (keyed by subId). */
  groups?: RowGroupMap
  /** P3.4: toggle a group's collapsed state. */
  onToggleGroup?: (subId: string, groupId: string) => void
  /** P3.4: remove a group (restore member rows to ungrouped positions). */
  onUngroup?: (subId: string, groupId: string) => void
}) {
  const style = getSectionStyle(section.flowDirection)

  const sectionChildren = useMemo(
    () =>
      categories
        .filter((c) => c.parentId === section.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, section.id],
  )

  const { sectionLines, itemMap } = useMemo(
    () => buildItemRows(section, sectionChildren, categories, lines),
    [section, sectionChildren, categories, lines],
  )

  const emptyKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const [key, itemLines] of itemMap) {
      if (itemLines.every((l) => l.amount === 0)) {
        keys.add(key)
      }
    }
    return keys
  }, [itemMap])

  const allZero = useMemo(() => sectionLines.every((l) => l.amount === 0), [sectionLines])

  const sectionTotals = useMemo(
    () =>
      periods.map((p) =>
        sectionLines.filter((l) => l.periodId === p.id).reduce((sum, l) => sum + l.amount, 0),
      ),
    [periods, sectionLines],
  )

  // Build a lookup from flat-row key → flat-row index for passing isFocused and
  // per-cell focus callbacks down to InlineCell.
  const flatIndexByKey = useMemo(() => {
    const m = new Map<string, number>()
    for (let i = 0; i < flatRows.length; i++) {
      const r = flatRows[i]!
      if (r.kind === 'subtotal') m.set(`sub::${r.subId}`, i)
      else if (r.kind === 'item') m.set(`item::${r.itemKey}`, i)
    }
    return m
  }, [flatRows])

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
        {sectionTotals.map((total, i) => {
          const { sticky, left } = freezeCellStyle(i, freezeCount)
          return (
            <td
              key={periods[i]!.id}
              className={cn(
                'px-2.5 py-2 text-right text-xs font-semibold tabular-nums',
                style.totalColor,
                sticky && cn('sticky z-[15]', style.stickyBg),
              )}
              style={sticky ? { left } : undefined}
            >
              {total !== 0 ? formatCurrency(total) : '—'}
            </td>
          )
        })}
      </tr>

      {/* Sub-section subtotal rows + data rows — only when not collapsed */}
      {!collapsed && (
        <>
          {sectionChildren.map((sub) => {
            const subCategoryIds = [
              sub.id,
              ...categories.filter((c) => c.parentId === sub.id).map((c) => c.id),
            ]
            const subLines = sectionLines.filter((l) => subCategoryIds.includes(l.categoryId))
            // "Empty" subs stay editable so the user can type a value and have
            // the grid create the first line. Only "all pipeline" locks it.
            const hasEditable =
              subLines.length === 0 || subLines.some((l) => l.source !== 'pipeline')

            const flatIdx = flatIndexByKey.get(`sub::${sub.id}`) ?? -1

            // Per-period totals for this sub-section
            const periodTotals = periods.map((p) =>
              subLines.filter((l) => l.periodId === p.id).reduce((sum, l) => sum + l.amount, 0),
            )

            return (
              <tr
                key={sub.id}
                className="bg-zinc-50/50 font-medium border-t border-zinc-100 text-zinc-600"
              >
                <td className="sticky left-0 z-10 bg-inherit whitespace-nowrap py-1.5 pr-4 text-sm pl-6">
                  {sub.sectionNumber ? `${sub.sectionNumber}. ${sub.name}` : sub.name}
                </td>
                {periods.map((p, colIdx) => {
                  const total = periodTotals[colIdx] ?? 0
                  const isFocusedCell =
                    focus !== null && focus.row === flatIdx && focus.col === colIdx
                  const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
                  const stickyLeft = sticky ? left : undefined
                  // Frozen subtotal cells need an opaque bg (row is bg-zinc-50/50 = semi-transparent).
                  const frozenSubtotalCls = sticky ? 'bg-zinc-50' : undefined
                  if (!hasEditable) {
                    return (
                      <InlineCell
                        key={p.id}
                        value={total}
                        isComputed
                        isNegative={total < 0}
                        onSave={() => {}}
                        onMoveFocus={(dir) => onMoveFocus(flatIdx, colIdx, dir)}
                        selection={{ isFocused: isFocusedCell }}
                        rowIdx={flatIdx}
                        colIdx={colIdx}
                        stickyLeft={stickyLeft}
                        className={frozenSubtotalCls}
                      />
                    )
                  }
                  // Note: subtotal InlineCell onSave ignores the formula param (second arg)
                  // because subtotal cells don't support cell-reference formulas.
                  return (
                    <InlineCell
                      key={p.id}
                      value={total}
                      isComputed={false}
                      isNegative={total < 0}
                      onSave={(newTotal) => onSubtotalSave(subCategoryIds, p.id, newTotal)}
                      onMoveFocus={(dir) => onMoveFocus(flatIdx, colIdx, dir)}
                      selection={{ isFocused: isFocusedCell }}
                      rowIdx={flatIdx}
                      colIdx={colIdx}
                      stickyLeft={stickyLeft}
                      className={frozenSubtotalCls}
                    />
                  )
                })}
              </tr>
            )
          })}

          {/* P3.4: render item rows and group header rows in flatRows order */}
          {flatRows.map((fr, flatIdx) => {
            if (fr.sectionId !== section.id) return null
            if (fr.kind !== 'item' && fr.kind !== 'group') return null

            // ── Group header row ─────────────────────────────────────────────
            if (fr.kind === 'group') {
              // Compute per-period sums across all member item rows.
              const memberLines = fr.memberItemKeys.flatMap((key) => {
                const itemLines = itemMap.get(key)
                return itemLines ?? []
              })
              const groupPeriodTotals = periods.map((p) =>
                memberLines.filter((l) => l.periodId === p.id).reduce((sum, l) => sum + l.amount, 0),
              )
              return (
                <tr
                  key={`group::${fr.group.id}`}
                  className="bg-indigo-50/40 border-t border-indigo-100 text-indigo-700"
                >
                  <td className="sticky left-0 z-10 bg-inherit whitespace-nowrap py-1 pr-4 pl-8">
                    <div className="flex items-center gap-1.5">
                      {/* Collapse/expand chevron */}
                      <button
                        onClick={() => onToggleGroup?.(fr.subId, fr.group.id)}
                        className="flex items-center text-indigo-400 hover:text-indigo-700"
                        title={fr.group.collapsed ? 'Expand group' : 'Collapse group'}
                      >
                        <svg
                          className={cn('w-3 h-3 transition-transform', fr.group.collapsed && '-rotate-90')}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <span className="text-xs font-medium">{fr.group.label}</span>
                      <span className="text-[10px] text-indigo-400">
                        ({fr.memberItemKeys.length} rows)
                      </span>
                      {/* Ungroup affordance */}
                      <button
                        onClick={() => onUngroup?.(fr.subId, fr.group.id)}
                        title="Remove group (rows return to normal positions)"
                        className="ml-1 text-[10px] text-indigo-400 hover:text-rose-600 leading-none"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                  {groupPeriodTotals.map((total, colIdx) => {
                    const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
                    return (
                      <td
                        key={periods[colIdx]!.id}
                        className={cn(
                          'px-2.5 py-1 text-right text-xs font-medium tabular-nums text-indigo-600',
                          sticky && 'sticky z-[15] bg-indigo-50',
                        )}
                        style={sticky ? { left } : undefined}
                      >
                        {total !== 0 ? formatCurrency(total) : '—'}
                      </td>
                    )
                  })}
                </tr>
              )
            }

            // ── Item row ─────────────────────────────────────────────────────
            const key = fr.itemKey
            const itemLines = itemMap.get(key)
            if (!itemLines) return null

            const firstLine = itemLines[0]!
            const label = firstLine.counterparty ?? firstLine.notes ?? 'Line item'
            const lineMap2 = new Map(itemLines.map((l) => [l.periodId, l]))
            const isPipeline = fr.isPipeline
            const line = firstLine

            // "Only matching rows" filter: skip rows not in the match set.
            // Matched rows always show even when hideEmpty is active.
            const isMatchedRow = filterRowSet != null && flatIdx >= 0 && filterRowSet.has(flatIdx)
            if (filterRowSet != null && !isMatchedRow) return null
            if (!isMatchedRow && hideEmpty && emptyKeys.has(key)) return null
            const isOverridden =
              overriddenSet && Array.from(lineMap2.values()).some((l) => overriddenSet.has(l.id))
            const overrideTitle = isOverridden
              ? `Overridden in ${overrideScenarioLabel ?? 'active scenario'}`
              : undefined

            if (isPipeline) {
              // Read-only row — delegate to ForecastRow
              return (
                <ForecastRow
                  key={key}
                  label={label}
                  lines={lineMap2}
                  periods={periods}
                  depth={2}
                  source={line.source}
                  confidence={line.confidence}
                  lineStatus={line.lineStatus}
                  readOnlyCells
                  freezeCount={freezeCount}
                  badge={
                    <>
                      <Badge variant="pipeline" className="ml-1.5">
                        Pipeline
                      </Badge>
                      {isOverridden && (
                        <span
                          title={overrideTitle}
                          className="ml-1.5 inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20"
                        >
                          Overridden
                        </span>
                      )}
                    </>
                  }
                  title={overrideTitle ?? (line.counterparty ?? undefined)}
                />
              )
            }

            // Editable item row — render directly so we can pass focus props per cell.
            return (
              <tr key={key} className="" title={overrideTitle}>
                <td className="sticky left-0 z-10 bg-inherit whitespace-nowrap py-1.5 pr-4 text-sm pl-10">
                  {line.source && (
                    <span
                      className={cn(
                        'mr-1.5 text-[8px]',
                        line.source === 'document'
                          ? 'text-indigo-500'
                          : line.source === 'recurring'
                            ? 'text-emerald-500'
                            : 'text-zinc-400',
                      )}
                    >
                      ●
                    </span>
                  )}
                  {label}
                  {isOverridden && (
                    <span
                      title={overrideTitle}
                      className="ml-1.5 inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20"
                    >
                      Overridden
                    </span>
                  )}
                  {line.confidence !== undefined && line.confidence < 100 && (
                    <span className="ml-1.5 text-xs text-amber-600">{line.confidence}%</span>
                  )}
                </td>
                {periods.map((p, colIdx) => {
                  const cellLine = lineMap2.get(p.id)
                  const amount = cellLine?.amount ?? 0
                  const isFocusedCell =
                    focus !== null && focus.row === flatIdx && focus.col === colIdx
                  const inRange = range ? isInRange(range, flatIdx, colIdx) : false
                  const inExtras = extraSelected.has(`${flatIdx}:${colIdx}`)
                  const inAnySelection = inRange || inExtras
                  const isAnchor = anchor !== null && anchor.row === flatIdx && anchor.col === colIdx
                  // Show the fill handle on the bottom-right cell of the
                  // current selection range, but only on editable cells.
                  const isBottomRight =
                    range !== null && range.rowEnd === flatIdx && range.colEnd === colIdx
                  const showHandle = isBottomRight
                  // Fill preview: in preview range but not in the source (selection).
                  const inFillPreview =
                    fillPreviewRange !== null &&
                    isInFillRange(fillPreviewRange, flatIdx, colIdx) &&
                    !inRange
                  const isFindHighlight =
                    highlightCell !== null &&
                    highlightCell !== undefined &&
                    highlightCell.row === flatIdx &&
                    highlightCell.col === colIdx
                  const { sticky: cellSticky, left: cellLeft } = freezeCellStyle(colIdx, freezeCount)
                  const stickyLeft = cellSticky ? cellLeft : undefined
                  return (
                    <InlineCell
                      key={p.id}
                      value={amount}
                      isNegative={amount < 0}
                      isComputed={false}
                      lineStatus={cellLine?.lineStatus}
                      formula={cellLine?.formula}
                      onSave={(newAmount, newFormula) => {
                        if (cellLine) {
                          onCellSave(cellLine.id, newAmount, newFormula ?? undefined)
                        } else if (newAmount !== 0) {
                          // Empty cell — create a new line from the row template.
                          // Skip creates for "" / 0 to avoid noise on accidental tab-throughs.
                          onCellCreate(line, p.id, newAmount)
                        }
                      }}
                      onClear={
                        cellLine
                          ? () => onCellClear(cellLine.id)
                          : undefined
                      }
                      onMoveFocus={(dir) => {
                        if (flatIdx >= 0) {
                          onMoveFocus(flatIdx, colIdx, dir)
                        }
                      }}
                      selection={{
                        isFocused: isFocusedCell,
                        inSelectionRange: inAnySelection,
                        isAnchor,
                        isFillPreview: inFillPreview,
                        isFindHighlight,
                      }}
                      fill={{
                        showFillHandle: showHandle,
                        onFillStart,
                        onFillDoubleClick,
                      }}
                      rowIdx={flatIdx}
                      colIdx={colIdx}
                      note={cellLine?.notes}
                      stickyLeft={stickyLeft}
                      onContextMenu={
                        onSplitCellOpen
                          ? (e) => onSplitCellOpen(e, cellLine, p.id, colIdx, lineMap2, isPipeline)
                          : undefined
                      }
                    />
                  )
                })}
              </tr>
            )
          })}
        </>
      )}
    </>
  )
})

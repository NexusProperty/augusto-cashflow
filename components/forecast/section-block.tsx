'use client'

import { useMemo, useState, memo } from 'react'
import { ForecastRow } from './forecast-row'
import { InlineCell } from './inline-cell'
import { Badge } from '@/components/ui/badge'
import { buildItemRows, type FlatRow, type RowGroupMap } from '@/lib/forecast/flat-rows'
import { isInRange } from '@/lib/forecast/selection'
import { isInFillRange } from '@/lib/forecast/fill-handle'
import { formatCurrency, cn } from '@/lib/utils'
import { MAIN_FORECAST_BANK_NAMES } from '@/lib/forecast/constants'
import type { BankAccount, ForecastLine, Period, Category, WeekSummary } from '@/lib/types'
import type { Direction } from './inline-cell-keys'
import { freezeCellStyle } from './forecast-grid'
import { BankChip } from './bank-chip'

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

// ── EditableLabel ────────────────────────────────────────────────────────────
// Click-to-edit label used by item rows. Enter/blur commits; Esc cancels.
// Stays uncontrolled during edit so the parent's optimistic patch doesn't
// clobber mid-typing.

function EditableLabel({
  value,
  onSave,
  disabled,
}: {
  value: string
  onSave: (next: string) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (disabled) {
    return <span>{value}</span>
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setDraft(value)
          setEditing(true)
        }}
        className="text-left hover:text-indigo-600 focus:text-indigo-600 focus:outline-none"
        title="Click to rename"
      >
        {value}
      </button>
    )
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== value) onSave(next)
  }

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(value)
          setEditing(false)
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="rounded border border-indigo-200 bg-white px-1 py-0 text-sm text-zinc-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
      size={Math.max(8, draft.length + 1)}
    />
  )
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
  bankAccounts,
  localBankBalances,
  summaries,
  onBankOpeningCommit,
  onRenameItem,
  onAddLine,
  onRowBankCommit,
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
  /** Main bank accounts (for bank-opening row rendering). */
  bankAccounts?: BankAccount[]
  /** Optimistic week-1 bank opening balances keyed by bank id. */
  localBankBalances?: Record<string, number>
  /** Engine summaries — used to render cascaded weeks 2-18 for bank-opening rows. */
  summaries?: WeekSummary[]
  /** Commit handler for a week-1 bank opening edit. */
  onBankOpeningCommit?: (bankAccountId: string, value: number) => void
  /** Rename an item row — writes counterparty on every line in the row. */
  onRenameItem?: (lineIds: string[], newName: string) => void
  /** Add a new line under a sub-category. Parent resolves entity + period. */
  onAddLine?: (subCategoryIds: string[]) => void
  /** Reassign every line in an item row to a new bank account. */
  onRowBankCommit?: (lineIds: string[], bankAccountId: string) => void
}) {
  const style = getSectionStyle(section.flowDirection)

  // Main banks in canonical render order, intersected with loaded accounts.
  // Shown in the row-label chip dropdown; undefined/empty if per-bank mode is off.
  const mainBanksInOrder = useMemo<BankAccount[]>(() => {
    if (!bankAccounts || bankAccounts.length === 0) return []
    return MAIN_FORECAST_BANK_NAMES
      .map((name) => bankAccounts.find((b) => b.name === name))
      .filter((b): b is BankAccount => Boolean(b))
  }, [bankAccounts])

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

  const allZero = useMemo(() => {
    if (section.flowDirection === 'balance') return false
    return sectionLines.every((l) => l.amount === 0)
  }, [sectionLines, section.flowDirection])

  const sectionTotals = useMemo(
    () =>
      periods.map((p) => {
        // Opening Bank Balance section: total = group opening (sum of bank openings)
        // taken from the engine summary for this period when available.
        if (section.flowDirection === 'balance') {
          const s = summaries?.find((ss) => ss.periodId === p.id)
          if (s) return s.openingBalance
          return 0
        }
        return sectionLines.filter((l) => l.periodId === p.id).reduce((sum, l) => sum + l.amount, 0)
      }),
    [periods, sectionLines, section.flowDirection, summaries],
  )

  // For each editable sub in this section, find the flatRows index of its
  // LAST row (subtotal if the sub has no items, otherwise the last item/group
  // row under it). An "+ Add line" row is emitted directly after that index
  // so it lands at the bottom of the sub's content.
  const addLineAfterIdx = useMemo(() => {
    const out = new Map<number, { subId: string; subCategoryIds: string[] }>()
    let current: { subId: string; subCategoryIds: string[]; lastIdx: number } | null = null
    const flush = () => {
      if (current)
        out.set(current.lastIdx, { subId: current.subId, subCategoryIds: current.subCategoryIds })
    }
    for (let i = 0; i < flatRows.length; i++) {
      const fr = flatRows[i]!
      if (fr.sectionId !== section.id) continue
      if (fr.kind === 'subtotal') {
        flush()
        current = fr.editable
          ? { subId: fr.subId, subCategoryIds: fr.subCategoryIds, lastIdx: i }
          : null
      } else if (fr.kind === 'item' || fr.kind === 'group') {
        if (current) current.lastIdx = i
      } else if (fr.kind === 'bank-opening') {
        // Balance section has no add-line affordance.
        flush()
        current = null
      }
    }
    flush()
    return out
  }, [flatRows, section.id])

  const renderAddLineRow = (flatIdx: number) => {
    const sub = addLineAfterIdx.get(flatIdx)
    if (!sub || !onAddLine) return null
    return (
      <tr
        key={`addline::${sub.subId}`}
        className="border-t border-dashed border-zinc-100"
      >
        <td className="sticky left-0 z-10 bg-white whitespace-nowrap py-1 pr-4 pl-10">
          <button
            type="button"
            onClick={() => onAddLine(sub.subCategoryIds)}
            className="text-xs text-zinc-400 hover:text-indigo-600 focus:text-indigo-600 focus:outline-none"
          >
            + Add line
          </button>
        </td>
        {periods.map((p, colIdx) => {
          const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
          return (
            <td
              key={p.id}
              className={cn('px-2.5 py-1', sticky && 'sticky z-[15] bg-white')}
              style={sticky ? { left } : undefined}
            />
          )
        })}
      </tr>
    )
  }

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

      {/* Sub-section subtotals + items + group headers, rendered in flatRows
          order so items stay pinned under their parent subtotal. */}
      {!collapsed && (
        <>
          {flatRows.map((fr, flatIdx) => {
            if (fr.sectionId !== section.id) return null
            if (
              fr.kind !== 'subtotal' &&
              fr.kind !== 'item' &&
              fr.kind !== 'group' &&
              fr.kind !== 'bank-opening'
            ) {
              return null
            }

            // ── Bank-opening row ─────────────────────────────────────────────
            if (fr.kind === 'bank-opening') {
              const bank = bankAccounts?.find((b) => b.id === fr.bankAccountId)
              const week1Value =
                localBankBalances?.[fr.bankAccountId] ?? bank?.openingBalance ?? 0
              return [
                <tr key={`bank-opening::${fr.bankAccountId}`} className="">
                  <td className="sticky left-0 z-10 bg-inherit whitespace-nowrap py-1.5 pr-4 pl-10 text-sm">
                    {fr.bankName}
                  </td>
                  {periods.map((p, colIdx) => {
                    const isFocusedCell =
                      focus !== null && focus.row === flatIdx && focus.col === colIdx
                    const inRange = range ? isInRange(range, flatIdx, colIdx) : false
                    const inExtras = extraSelected.has(`${flatIdx}:${colIdx}`)
                    const inAnySelection = inRange || inExtras
                    const isAnchor =
                      anchor !== null && anchor.row === flatIdx && anchor.col === colIdx
                    const isFindHighlight =
                      highlightCell !== null &&
                      highlightCell !== undefined &&
                      highlightCell.row === flatIdx &&
                      highlightCell.col === colIdx
                    const { sticky: cellSticky, left: cellLeft } = freezeCellStyle(
                      colIdx,
                      freezeCount,
                    )
                    const stickyLeft = cellSticky ? cellLeft : undefined

                    if (colIdx === 0) {
                      // Editable week-1 opening balance.
                      return (
                        <InlineCell
                          key={p.id}
                          value={week1Value}
                          isNegative={week1Value < 0}
                          isComputed={false}
                          onSave={(newValue) => {
                            if (newValue !== week1Value) {
                              onBankOpeningCommit?.(fr.bankAccountId, newValue)
                            }
                          }}
                          onMoveFocus={(dir) => onMoveFocus(flatIdx, colIdx, dir)}
                          selection={{
                            isFocused: isFocusedCell,
                            inSelectionRange: inAnySelection,
                            isAnchor,
                            isFindHighlight,
                          }}
                          rowIdx={flatIdx}
                          colIdx={colIdx}
                          stickyLeft={stickyLeft}
                        />
                      )
                    }
                    // Weeks 2-18 are computed: prior week's closing for this bank.
                    const s = summaries?.find((ss) => ss.periodId === p.id)
                    const bb = s?.byBank.find((b) => b.bankAccountId === fr.bankAccountId)
                    const computed = bb?.openingBalance ?? 0
                    return (
                      <td
                        key={p.id}
                        tabIndex={0}
                        data-row={flatIdx}
                        data-col={colIdx}
                        title="= prior week's closing for this account"
                        className={cn(
                          'relative bg-zinc-50/60 px-2.5 py-1.5 text-right text-sm tabular-nums text-zinc-700 outline-none',
                          computed < 0 && 'text-red-600',
                          inAnySelection && !isFocusedCell && (isAnchor ? 'bg-indigo-100' : 'bg-indigo-50'),
                          isFocusedCell && 'ring-2 ring-indigo-500',
                          isFindHighlight && 'ring-2 ring-yellow-400',
                          cellSticky && 'sticky z-[15]',
                        )}
                        style={cellSticky ? { left: cellLeft } : undefined}
                      >
                        {formatCurrency(computed)}
                      </td>
                    )
                  })}
                </tr>,
                renderAddLineRow(flatIdx),
              ]
            }

            // ── Subtotal row ─────────────────────────────────────────────────
            if (fr.kind === 'subtotal') {
              const sub = sectionChildren.find((c) => c.id === fr.subId)
              if (!sub) return null
              const subCategoryIdSet = new Set(fr.subCategoryIds)
              const subLines = sectionLines.filter((l) => subCategoryIdSet.has(l.categoryId))
              const hasEditable = fr.editable

              const periodTotals = periods.map((p) =>
                subLines.filter((l) => l.periodId === p.id).reduce((sum, l) => sum + l.amount, 0),
              )

              return [
                <tr
                  key={`sub::${sub.id}`}
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
                    // Subtotal InlineCell onSave ignores the formula param
                    // (subtotals don't support cell-reference formulas).
                    return (
                      <InlineCell
                        key={p.id}
                        value={total}
                        isComputed={false}
                        isNegative={total < 0}
                        onSave={(newTotal) => onSubtotalSave(fr.subCategoryIds, p.id, newTotal)}
                        onMoveFocus={(dir) => onMoveFocus(flatIdx, colIdx, dir)}
                        selection={{ isFocused: isFocusedCell }}
                        rowIdx={flatIdx}
                        colIdx={colIdx}
                        stickyLeft={stickyLeft}
                        className={frozenSubtotalCls}
                      />
                    )
                  })}
                </tr>,
                renderAddLineRow(flatIdx),
              ]
            }


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
              return [
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
                </tr>,
                renderAddLineRow(flatIdx),
              ]
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
              return [
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
                />,
                renderAddLineRow(flatIdx),
              ]
            }

            // Editable item row — render directly so we can pass focus props per cell.
            return [
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
                  <EditableLabel
                    value={label}
                    disabled={!onRenameItem}
                    onSave={(next) => onRenameItem?.(fr.lineIds, next)}
                  />
                  {mainBanksInOrder.length > 0 && onRowBankCommit && (
                    <BankChip
                      currentBankId={firstLine.bankAccountId}
                      banks={mainBanksInOrder}
                      onPick={(bankId) => onRowBankCommit(fr.lineIds, bankId)}
                    />
                  )}
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
              </tr>,
              renderAddLineRow(flatIdx),
            ]
          })}
        </>
      )}
    </>
  )
})

'use client'

import { useTransition, useState, useCallback, useMemo, useEffect, useRef, memo } from 'react'
import { ForecastRow } from './forecast-row'
import { InlineCell } from './inline-cell'
import { Badge } from '@/components/ui/badge'
import {
  addForecastLine,
  bulkAddForecastLines,
  bulkUpdateLineStatus,
  deleteForecastLine,
  updateLineAmounts,
} from '@/app/(app)/forecast/actions'
import {
  UndoStack,
  entryReplayable,
  groupByPrevStatus,
  type AtomicUndoEntry,
  type AmountUpdate,
} from '@/lib/forecast/undo'
import { computeAggregates, type Aggregates } from '@/lib/forecast/aggregates'
import { computeWeekSummaries } from '@/lib/forecast/engine'
import { prorateSubtotal } from '@/lib/forecast/proration'
import { buildFlatRows, buildItemRows, isFocusable, type FlatRow, type RowGroup, type RowGroupMap } from '@/lib/forecast/flat-rows'
import {
  collapseTo,
  extendByArrow,
  extendSelection,
  isInRange,
  iterateRange,
  jumpToEdge,
  toRange,
  type Selection,
} from '@/lib/forecast/selection'
import { toTSV, parseTSV, parseClipboardNumber } from '@/lib/forecast/clipboard'
import { computeFillHandleRange, isInFillRange, detectPattern, materialisePattern } from '@/lib/forecast/fill-handle'
import { planShift, type ShiftAmountUpdate, type ShiftCreate } from '@/lib/forecast/shift-by-weeks'
import { planSplitCell, parseSplitAmounts, type SplitCellPlan } from '@/lib/forecast/split-cell'
import { buildMatchList, nextMatchIndex, prevMatchIndex, type FindMatch } from '@/lib/forecast/find'
import { buildDependencyGraph, topologicalOrder, findDependents } from '@/lib/forecast/dep-graph'
import { evaluateFormula, type EvalContext } from '@/lib/forecast/formula'
import { buildCsv } from '@/lib/forecast/export'
import { FindBar } from './find-bar'
import { weekEndingLabel, formatCurrency, cn } from '@/lib/utils'
import type { ForecastLine, LineStatus, Period, Category, WeekSummary } from '@/lib/types'
import type { Direction } from './inline-cell-keys'

// ── Freeze-columns hook ───────────────────────────────────────────────────────
// Persists the user's choice to localStorage['forecast.freezeCount'].
// On viewports narrower than 1280px the effective freeze count is forced to 0
// (the sticky offsets are hardcoded in px and break on narrow screens).
function useFreezeCount(): [number, (n: number) => void, boolean] {
  const [freezeCount, setFreezeCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const raw = window.localStorage.getItem('forecast.freezeCount')
    const n = raw ? parseInt(raw, 10) : 0
    return n === 1 || n === 2 ? n : 0
  })

  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 1279px)').matches
  })

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1279px)')
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const update = useCallback((n: number) => {
    setFreezeCount(n)
    try { window.localStorage.setItem('forecast.freezeCount', String(n)) } catch { /* storage full or disabled */ }
  }, [])

  const effective = isNarrow ? 0 : freezeCount
  return [effective, update, isNarrow]
}

// ── Freeze-columns style helper ───────────────────────────────────────────────
// Hardcoded: 280px for the label column + 100px per week column (approximation).
// Chosen for simplicity — actual week columns are right-aligned numeric cells
// that tend to be ~100px wide. If visual gaps appear, switch to measured widths.
function freezeCellStyle(colIdx: number, freezeCount: number): { sticky: boolean; left: number } {
  if (colIdx >= freezeCount) return { sticky: false, left: 0 }
  return { sticky: true, left: 280 + 100 * colIdx }
}

// ── FreezePicker control ──────────────────────────────────────────────────────
function FreezePicker({
  freezeCount,
  onChange,
  disabled,
}: {
  freezeCount: number
  onChange: (n: number) => void
  disabled: boolean
}) {
  return (
    <select
      value={String(freezeCount)}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      disabled={disabled}
      title={disabled ? 'Disabled on narrow screens — widen the window to use freeze columns' : 'Freeze the first N week columns during horizontal scroll'}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
    >
      <option value="0">Freeze: Off</option>
      <option value="1">Freeze: 1 week</option>
      <option value="2">Freeze: 2 weeks</option>
    </select>
  )
}

// ── Row-grouping hook (P3.4) ──────────────────────────────────────────────────
// Persists user-defined row groups to localStorage['forecast.groups.v1'].
// SSR-safe: all localStorage access guarded by typeof window check.
const GROUPS_STORAGE_KEY = 'forecast.groups.v1'

function useGroups(): [RowGroupMap, (updater: (prev: RowGroupMap) => RowGroupMap) => void] {
  const [groups, setGroupsState] = useState<RowGroupMap>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY)
      if (!raw) return {}
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
      return parsed as RowGroupMap
    } catch {
      return {}
    }
  })

  const setGroups = useCallback((updater: (prev: RowGroupMap) => RowGroupMap) => {
    setGroupsState((prev) => {
      const next = updater(prev)
      try { window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next)) } catch { /* storage full */ }
      return next
    })
  }, [])

  return [groups, setGroups]
}

// ── SplitCellModal ────────────────────────────────────────────────────────────

interface SplitCellModalProps {
  sourceLine: ForecastLine
  sourceRow: { kind: 'item'; lineByPeriod: Map<string, ForecastLine>; isPipeline: boolean }
  sourceCol: number
  periodLabel: string
  periods: Array<{ id: string }>
  onApply: (plan: SplitCellPlan) => void
  onClose: () => void
}

function SplitCellModal({
  sourceLine,
  sourceRow,
  sourceCol,
  periodLabel,
  periods,
  onApply,
  onClose,
}: SplitCellModalProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Escape → close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const parseResult = parseSplitAmounts(inputValue)
  const plan =
    parseResult.ok
      ? planSplitCell({ sourceLine, sourceRow, sourceCol, amounts: parseResult.values, periods })
      : null

  const isValid = parseResult.ok && plan !== null && (plan.updates.length > 0 || plan.creates.length > 0)

  const handleApply = () => {
    if (!plan || !isValid) return
    onApply(plan)
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => {
        // Click outside the modal card → close.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Modal card */}
      <div
        className="w-[400px] rounded-xl border border-zinc-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Split cell across weeks</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {sourceLine.counterparty ?? 'Line item'} &middot; w/e {periodLabel} &middot; {formatCurrency(sourceLine.amount)}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label className="mb-1.5 block text-xs font-medium text-zinc-700">
            Amounts (comma-separated)
          </label>
          <input
            ref={inputRef}
            type="text"
            placeholder="e.g. 4000, 6000, 2000"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid) {
                e.preventDefault()
                handleApply()
              }
            }}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />

          {/* Live preview / error */}
          <div className="mt-2 min-h-[20px] text-xs">
            {inputValue.trim() && !parseResult.ok && (
              <span className="text-red-600">{parseResult.error}</span>
            )}
            {isValid && plan && plan.collisions > 0 && (
              <span className="text-amber-600">
                {plan.collisions} existing {plan.collisions === 1 ? 'cell' : 'cells'} will be overwritten
              </span>
            )}
            {isValid && plan && plan.collisions === 0 && (
              <span className="text-zinc-400">
                {plan.updates.length + plan.creates.length} {plan.updates.length + plan.creates.length === 1 ? 'cell' : 'cells'} affected
                {plan.skipped > 0 ? `, ${plan.skipped} skipped (out of range or pipeline)` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!isValid}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ForecastGridProps ─────────────────────────────────────────────────────────

interface ForecastGridProps {
  periods: Period[]
  categories: Category[]
  lines: ForecastLine[]
  summaries: WeekSummary[]
  entities?: Array<{ id: string; name: string }>
  overriddenIds?: string[]
  overrideScenarioLabel?: string
  weighted?: boolean
  odFacilityLimit?: number
  scenarioId?: string | null
}

export function ForecastGrid({
  periods,
  categories,
  lines: linesProp,
  summaries: summariesProp,
  entities = [],
  overriddenIds,
  overrideScenarioLabel,
  weighted = true,
  odFacilityLimit = 0,
  scenarioId = null,
}: ForecastGridProps) {
  const [isPending, startTransition] = useTransition()

  // ── Freeze columns ────────────────────────────────────────────────────────
  const [freezeCount, setFreezeCount, isNarrowScreen] = useFreezeCount()

  // ── Row groups (P3.4) ─────────────────────────────────────────────────────
  const [groups, setGroups] = useGroups()

  // ── Save status indicator (Saving / Saved / Undone / Redone / Error) ────────
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'undone' | 'redone' | 'error'>('idle')
  const [lastSaveError, setLastSaveError] = useState<string | null>(null)
  const saveStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current)
  }, [])
  const markSaved = useCallback(() => {
    setSaveStatus('saved')
    setLastSaveError(null)
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current)
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }, [])
  const markError = useCallback((msg: string) => {
    setSaveStatus('error')
    setLastSaveError(msg)
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current)
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 4000)
  }, [])
  const markUndone = useCallback(() => {
    setSaveStatus('undone')
    setLastSaveError(null)
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current)
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }, [])
  const markRedone = useCallback(() => {
    setSaveStatus('redone')
    setLastSaveError(null)
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current)
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }, [])

  // ── Optimistic local state ────────────────────────────────────────────────
  const [localLines, setLocalLines] = useState<ForecastLine[]>(linesProp)
  // Resync when server prop reference changes (e.g. revalidatePath) — but ONLY
  // while no save is in flight. A mid-flight optimistic edit must not be
  // overwritten by a stale revalidate that raced ahead of the save's .then.
  // When isPending flips back to false, the effect runs again with the latest
  // linesProp and we pick up the server state.
  useEffect(() => {
    if (isPending) return
    setLocalLines(linesProp)
  }, [linesProp, isPending])

  // Snapshot of last-server-known amounts, used to revert on server error.
  // Same guard: only resync while no save is in flight, or we'd clobber a
  // pending-save's captured `old` snapshot.
  const snapshotRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    if (isPending) return
    const m = new Map<string, number>()
    for (const l of linesProp) m.set(l.id, l.amount)
    snapshotRef.current = m
  }, [linesProp, isPending])

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undoStackRef = useRef(new UndoStack())
  const isReplayingRef = useRef(false)

  // Stable ref to handleShift — allows handleGridKeyDown (defined before handleShift)
  // to call it without a forward-reference TS error. Updated in the handleShift callback.
  const handleShiftRef = useRef<(n: number, opts: { autoConfirm: boolean }) => Promise<void>>(
    async () => { /* noop until handleShift is defined below */ },
  )

  // Stable ref to handleDeleteSelection — same forward-reference pattern as handleShiftRef.
  const handleDeleteSelectionRef = useRef<() => void>(() => { /* noop until defined below */ })
  // Stable ref to handleDuplicateRight — same forward-reference pattern as handleShiftRef.
  const handleDuplicateRightRef = useRef<() => Promise<void>>(async () => { /* noop until defined below */ })
  // Stable ref to selectedCellKeys.size — read in handleGridKeyDown (defined earlier).
  const selectedCellKeysSizeRef = useRef(0)
  const localLinesRef = useRef(localLines)
  useEffect(() => { localLinesRef.current = localLines }, [localLines])
  // Stable refs for flatRows, formulaGraph, and periods so saveUpdates (declared before
  // the useMemos) can access the latest values without TDZ / hook-ordering issues.
  const flatRowsRef = useRef<FlatRow[]>([])
  const formulaGraphRef = useRef<Map<string, string[]>>(new Map())
  const periodsRef = useRef(periods)

  // Derive summaries from local state so edits cascade to NetOperating,
  // ClosingBalance, AvailableCash, OD Status immediately.
  const summaries = useMemo(
    () => computeWeekSummaries(periods, localLines, categories, odFacilityLimit, weighted),
    [periods, localLines, categories, odFacilityLimit, weighted],
  )
  // `summariesProp` is retained for first-render parity / fallback.
  const summaryMap = useMemo(
    () => new Map((summaries.length > 0 ? summaries : summariesProp).map((s) => [s.periodId, s])),
    [summaries, summariesProp],
  )

  const overriddenSet = useMemo(() => new Set(overriddenIds ?? []), [overriddenIds])

  // ── Save plumbing ─────────────────────────────────────────────────────────

  const applyLocal = useCallback((updates: Array<{ id: string; amount: number; formula?: string | null }>) => {
    setLocalLines((prev) => {
      const m = new Map(updates.map((u) => [u.id, u]))
      return prev.map((l) => {
        const u = m.get(l.id)
        if (!u) return l
        // Only update formula when it's explicitly provided in the update.
        const formulaUpdate = u.formula !== undefined ? { formula: u.formula } : {}
        return { ...l, amount: u.amount, ...formulaUpdate }
      })
    })
  }, [])

  /**
   * Given a set of direct edits (already applied optimistically to `localLines`
   * via `applyLocal`), compute cascade re-evaluations for all formula-bearing
   * lines that transitively depend on those edited lineIds.
   *
   * Returns an array of additional `{ id, amount, formula }` updates to include
   * in the same server batch, OR `{ error: string }` if a cycle is detected.
   *
   * NOTE: The snapshot passed in (`linesSnapshot`) should be the ALREADY-UPDATED
   * local lines (post-applyLocal) so formula evaluation sees the new values.
   */
  /**
   * Given a set of direct edits (already applied optimistically to `localLines`
   * via `applyLocal`), compute cascade re-evaluations for all formula-bearing
   * lines that transitively depend on those edited lineIds.
   *
   * All data needed for evaluation (flatRows, periods) is passed explicitly so
   * this callback can be declared before those useMemo values are computed.
   *
   * Returns an array of additional `{ id, amount, formula }` updates to include
   * in the same server batch, OR `{ error: string }` if a cycle is detected.
   */
  const computeCascade = useCallback(
    (
      editedLineIds: string[],
      linesSnapshot: ForecastLine[],
      graph: Map<string, string[]>,
      currentFlatRows: FlatRow[],
      currentPeriods: Array<{ id: string }>,
    ): Array<{ id: string; amount: number; formula: string }> | { error: string } => {
      const dependentIds = findDependents(graph, editedLineIds)
      if (dependentIds.length === 0) return []

      // Build a subgraph covering just the dependents + their own deps.
      const subgraph = new Map<string, string[]>()
      for (const id of dependentIds) {
        subgraph.set(id, graph.get(id) ?? [])
      }
      const topoResult = topologicalOrder(subgraph)
      if ('error' in topoResult) {
        return { error: 'Cycle detected in formula dependencies' }
      }

      // Build a mutable amount map seeded from the updated snapshot.
      const amountMap = new Map<string, number>()
      for (const l of linesSnapshot) amountMap.set(l.id, l.amount)

      // Build lineId → line map for fast lookups.
      const lineById = new Map(linesSnapshot.map((l) => [l.id, l]))

      const results: Array<{ id: string; amount: number; formula: string }> = []

      // Walk in topological order — deps evaluated before formulas that read them.
      for (const lineId of topoResult.order) {
        if (!dependentIds.includes(lineId)) continue
        const depLine = lineById.get(lineId)
        if (!depLine?.formula) continue

        // Build a minimal EvalContext for this formula line.
        const label = depLine.counterparty ?? depLine.notes ?? 'Line item'
        const currentItemKey = `${depLine.categoryId}::${label}`

        // Find the FlatRow for the current item.
        const currentFlatRow = currentFlatRows.find(
          (r) => r.kind === 'item' && r.itemKey === currentItemKey,
        )
        if (!currentFlatRow || currentFlatRow.kind !== 'item') continue

        const ctx: EvalContext = {
          currentRow: currentFlatRow as EvalContext['currentRow'],
          flatRows: currentFlatRows,
          periods: currentPeriods,
          getAmount: (itemKey: string, periodId: string) => {
            // Find the line for this itemKey + periodId from the snapshot.
            // Use the mutable amountMap so cascade-updated values feed forward.
            const matchLine = linesSnapshot.find((l) => {
              const lLabel = l.counterparty ?? l.notes ?? 'Line item'
              return `${l.categoryId}::${lLabel}` === itemKey && l.periodId === periodId
            })
            if (!matchLine) return 0
            return amountMap.get(matchLine.id) ?? 0
          },
        }

        const result = evaluateFormula(depLine.formula, ctx)
        if (!result.ok) {
          // Evaluation error on a dependent formula — skip cascade for this line.
          continue
        }

        // Update the mutable map so downstream formulas see the new value.
        amountMap.set(lineId, result.value)
        results.push({ id: lineId, amount: result.value, formula: depLine.formula })
      }

      return results
    },
    [],
  )

  const saveUpdates = useCallback(
    (updates: Array<{ id: string; amount: number; formula?: string | null }>) => {
      if (updates.length === 0) return
      // Capture pre-edit values for potential revert. Done BEFORE we mutate
      // snapshotRef so a concurrent second save sees the latest optimistic
      // state — not the pre-first-save values.
      // Also snapshot the prior formula for each updated line so undo can restore it.
      const old = updates.map((u) => {
        const priorLine = localLinesRef.current.find((l) => l.id === u.id)
        return {
          id: u.id,
          amount: snapshotRef.current.get(u.id) ?? 0,
          // Only include formula in the inverse if this update is changing it.
          // That way undo restores the exact prior formula state.
          ...(u.formula !== undefined ? { formula: priorLine?.formula ?? null } : {}),
        }
      })

      // Promote the optimistic values into the snapshot immediately. If a
      // second save fires before this one's .then resolves, it will capture
      // THIS edit's new values in its own `old`, not the stale pre-edit ones.
      for (const u of updates) snapshotRef.current.set(u.id, u.amount)

      // Build an in-memory post-edit snapshot BEFORE calling applyLocal.
      // applyLocal schedules a setState which is async — localLinesRef.current
      // still holds the pre-edit values at this point. computeCascade must
      // evaluate formula dependents against the NEW values, not the stale ones.
      const updateMap = new Map(updates.map((u) => [u.id, u]))
      const postEditLines = localLinesRef.current.map((l) => {
        const u = updateMap.get(l.id)
        if (!u) return l
        return {
          ...l,
          amount: u.amount,
          ...(u.formula !== undefined ? { formula: u.formula } : {}),
        }
      })

      // Optimistic UI — apply direct edits first.
      applyLocal(updates)

      // ── Formula cascade ──────────────────────────────────────────────────
      // After applying the direct edits, re-evaluate any formula cells that
      // transitively depend on the edited cells. The results are merged into
      // the same server batch and undo entry so the whole operation is atomic.
      // We pass postEditLines (not localLinesRef.current) so cascade sees the
      // post-edit values and avoids evaluating against stale pre-edit amounts.
      const editedIds = updates.map((u) => u.id)
      const cascadeResult = computeCascade(
        editedIds,
        postEditLines,
        formulaGraphRef.current,
        flatRowsRef.current,
        periodsRef.current,
      )

      let cascadeUpdates: Array<{ id: string; amount: number; formula: string }> = []
      if ('error' in cascadeResult) {
        // Cycle detected — revert the direct edit and surface the error.
        applyLocal(old)
        for (const o of old) snapshotRef.current.set(o.id, o.amount)
        markError(cascadeResult.error)
        return
      } else {
        cascadeUpdates = cascadeResult
        if (cascadeUpdates.length > 0) {
          applyLocal(cascadeUpdates)
          for (const u of cascadeUpdates) snapshotRef.current.set(u.id, u.amount)
        }
      }

      const allUpdates = [...updates, ...cascadeUpdates]

      // Push undo entry before the transition (not inside .then) so the user
      // can undo immediately after the optimistic apply. Guard: no push during
      // a replay so undo/redo don't recurse onto the stack.
      if (!isReplayingRef.current) {
        undoStackRef.current.push({
          kind: 'amounts',
          forward: allUpdates as AmountUpdate[],
          inverse: old as AmountUpdate[],
          label: `Edit ${updates.length} cell${updates.length === 1 ? '' : 's'}`,
          scenarioId,
        })
      }

      // Build cascade-old for revert: the pre-edit values for cascade lines.
      const cascadeOld = cascadeUpdates.map((u) => ({
        id: u.id,
        amount: old.find((o) => o.id === u.id)?.amount ?? (snapshotRef.current.get(u.id) ?? 0),
        formula: u.formula, // cascade keeps same formula — restore it on revert
      }))

      startTransition(() => {
        updateLineAmounts({ updates: allUpdates })
          .then((res) => {
            if ('error' in res) {
              // Revert local state AND the snapshot — the server never
              // accepted these values, so subsequent saves must see the
              // real pre-edit amounts.
              applyLocal([...old, ...cascadeOld])
              for (const o of [...old, ...cascadeOld]) snapshotRef.current.set(o.id, o.amount)
              if (process.env.NODE_ENV === 'development') {
                console.warn('updateLineAmounts failed:', res.error)
              }
              markError(res.error ?? 'Save failed')
            } else {
              // Snapshot already holds the optimistic values — nothing more
              // to do. Mark saved for the UI chip.
              markSaved()
            }
          })
          .catch((err) => {
            applyLocal([...old, ...cascadeOld])
            for (const o of [...old, ...cascadeOld]) snapshotRef.current.set(o.id, o.amount)
            if (process.env.NODE_ENV === 'development') {
              console.warn('updateLineAmounts threw:', err)
            }
            markError(err instanceof Error ? err.message : 'Network error')
          })
      })
    },
    [applyLocal, computeCascade, startTransition, markSaved, markError, scenarioId],
  )

  const handleCellSave = useCallback(
    (lineId: string, amount: number, formula?: string | null) => {
      saveUpdates([{ id: lineId, amount, ...(formula !== undefined ? { formula } : {}) }])
    },
    [saveUpdates],
  )

  const handleCellClear = useCallback(
    (lineId: string) => {
      saveUpdates([{ id: lineId, amount: 0 }])
    },
    [saveUpdates],
  )

  // Editing an EMPTY cell on an existing item row: create a new forecast_line
  // inheriting the row's template (entity + category + counterparty) and the
  // clicked period + entered amount. Optimistically added to local state with
  // a temp id, then replaced with the real row on server response.
  const handleEmptyCellCreate = useCallback(
    (template: ForecastLine, periodId: string, amount: number, undoLabel = 'Create cell') => {
      const tempId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? `temp-${crypto.randomUUID()}`
          : `temp-${Math.random().toString(36).slice(2)}-${Date.now()}`

      const optimisticLine: ForecastLine = {
        id: tempId,
        entityId: template.entityId,
        categoryId: template.categoryId,
        periodId,
        amount,
        confidence: 100,
        source: 'manual',
        counterparty: template.counterparty,
        notes: template.notes,
        sourceDocumentId: null,
        sourceRuleId: null,
        sourcePipelineProjectId: null,
        lineStatus: 'confirmed',
        formula: null,
      }

      setLocalLines((prev) => [...prev, optimisticLine])

      // Push created entry immediately with realId=null; patch it on success.
      if (!isReplayingRef.current) {
        undoStackRef.current.push({
          kind: 'created',
          tempId,
          realId: null,
          label: undoLabel,
          scenarioId,
        })
      }

      const fd = new FormData()
      fd.set('entityId', template.entityId)
      fd.set('categoryId', template.categoryId)
      fd.set('periodId', periodId)
      fd.set('amount', String(amount))
      if (template.counterparty) fd.set('counterparty', template.counterparty)
      if (template.notes) fd.set('notes', template.notes)

      startTransition(() => {
        addForecastLine(fd)
          .then((result) => {
            if ('error' in result && result.error) {
              setLocalLines((prev) => prev.filter((l) => l.id !== tempId))
              undoStackRef.current.removeTempEntry(tempId)
              markError(result.error)
              return
            }
            if ('data' in result && result.data) {
              const raw = result.data as Record<string, unknown>
              const real: ForecastLine = {
                id: String(raw.id),
                entityId: String(raw.entity_id),
                categoryId: String(raw.category_id),
                periodId: String(raw.period_id),
                amount: Number(raw.amount) || 0,
                confidence:
                  typeof raw.confidence === 'number' ? raw.confidence : 100,
                source: (raw.source as ForecastLine['source']) ?? 'manual',
                counterparty: (raw.counterparty as string | null) ?? null,
                notes: (raw.notes as string | null) ?? null,
                sourceDocumentId: (raw.source_document_id as string | null) ?? null,
                sourceRuleId: (raw.source_rule_id as string | null) ?? null,
                sourcePipelineProjectId:
                  (raw.source_pipeline_project_id as string | null) ?? null,
                lineStatus:
                  (raw.line_status as ForecastLine['lineStatus']) ?? 'confirmed',
                formula: (raw.formula as string | null) ?? null,
              }
              setLocalLines((prev) =>
                prev.map((l) => (l.id === tempId ? real : l)),
              )
              snapshotRef.current.set(real.id, real.amount)
              undoStackRef.current.patchRealId(tempId, real.id)
              markSaved()
            }
          })
          .catch((err) => {
            setLocalLines((prev) => prev.filter((l) => l.id !== tempId))
            undoStackRef.current.removeTempEntry(tempId)
            markError(err instanceof Error ? err.message : 'Create failed')
          })
      })
    },
    [startTransition, markError, markSaved, scenarioId],
  )

  // Editing an empty SUBTOTAL cell (a subcategory with no underlying manual
  // lines for this period). We synthesise a template using the first active
  // entity in the group and the subcategory itself, then delegate to the
  // existing empty-cell create path so optimistic insert, temp-id swap and
  // error revert behave identically.
  const handleEmptySubtotalCreate = useCallback(
    (subCategoryIds: string[], periodId: string, amount: number) => {
      if (amount === 0) return
      const entity = entities[0]
      if (!entity) {
        markError('No entity available — add one in Settings first')
        return
      }
      const categoryId = subCategoryIds[0]
      if (!categoryId) return
      const template: ForecastLine = {
        id: '__pseudo_template__',
        entityId: entity.id,
        categoryId,
        periodId,
        amount: 0,
        confidence: 100,
        source: 'manual',
        counterparty: null,
        notes: null,
        sourceDocumentId: null,
        sourceRuleId: null,
        sourcePipelineProjectId: null,
        lineStatus: 'confirmed',
        formula: null,
      }
      handleEmptyCellCreate(template, periodId, amount, 'Create subtotal cell')
    },
    [entities, handleEmptyCellCreate, markError],
  )

  // ── Sections + collapsed state ────────────────────────────────────────────

  const sections = useMemo(
    () =>
      categories
        .filter((c) => c.parentId === null && c.flowDirection !== 'computed')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  )

  // Default collapsed: sections with no data start collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const section of sections) {
      const children = categories.filter((c) => c.parentId === section.id)
      const hasData = linesProp.some((l) => {
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

  // ── Find (Ctrl+F) ─────────────────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [onlyMatching, setOnlyMatching] = useState(false)
  const [matchCursor, setMatchCursor] = useState<number | null>(null)
  const [highlightCell, setHighlightCell] = useState<{ row: number; col: number } | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
  }, [])

  const toggleSection = useCallback((id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // ── Flat rows for focus navigation ────────────────────────────────────────

  const flatRows = useMemo(
    () => buildFlatRows(sections, categories, localLines, collapsed, groups),
    [sections, categories, localLines, collapsed, groups],
  )

  // ── Formula dependency graph ───────────────────────────────────────────────
  // Rebuilt whenever localLines changes. Cheap: pure graph scan, no evaluation.
  const formulaGraph = useMemo(
    () => buildDependencyGraph(localLines, flatRows, periods),
    [localLines, flatRows, periods],
  )

  // Keep refs in sync so saveUpdates (defined before these useMemos) can
  // access the latest flatRows / formulaGraph / periods without TDZ issues.
  useEffect(() => { flatRowsRef.current = flatRows }, [flatRows])
  useEffect(() => { formulaGraphRef.current = formulaGraph }, [formulaGraph])
  useEffect(() => { periodsRef.current = periods }, [periods])

  // ── Find derived state ────────────────────────────────────────────────────
  const matches = useMemo(
    () => (findQuery.trim() ? buildMatchList({ flatRows, periods, query: findQuery }) : []),
    [findQuery, flatRows, periods],
  )
  // Reset cursor when query changes so navigation restarts from the top.
  useEffect(() => {
    setMatchCursor(null)
  }, [findQuery])

  const filterRowSet = useMemo(
    () => (onlyMatching && matches.length > 0 ? new Set(matches.map((m) => m.row)) : null),
    [onlyMatching, matches],
  )

  // Selection state in (flatRowIndex, periodIndex) space. Single-cell selection
  // has anchor === focus; multi-cell has anchor at origin and focus at active.
  const [selection, setSelection] = useState<Selection | null>(null)
  const focus = selection?.focus ?? null

  // Discontiguous additions via Ctrl/Cmd+Click. Kept separate from the
  // rectangular `selection` so range-shaped operations (paste, fill-handle,
  // arrow extension) don't have to reason about holes. Keys are `row:col`.
  const [extraSelected, setExtraSelected] = useState<Set<string>>(new Set())
  const extraCellKey = useCallback((row: number, col: number) => `${row}:${col}`, [])

  // Derive the rectangular range for highlighting.
  const range = useMemo(() => (selection ? toRange(selection) : null), [selection])

  const isFocusableRow = useCallback(
    (row: number) => isFocusable(flatRows[row]),
    [flatRows],
  )

  const moveFocus = useCallback(
    (fromRow: number, fromCol: number, direction: Direction) => {
      const colMax = periods.length - 1
      if (colMax < 0) return
      const rowMax = flatRows.length - 1
      // Plain arrow — collapse to single cell then step. We use extendByArrow
      // against a collapsed selection to get edge/row-skip behaviour for free.
      const base = collapseTo({ row: fromRow, col: fromCol })
      const next = extendByArrow(base, direction, rowMax, colMax, isFocusableRow)
      setSelection(collapseTo(next.focus))
    },
    [flatRows.length, periods.length, isFocusableRow],
  )

  // ── Find: navigate to a match, expanding collapsed sections if needed ─────

  const navigateToMatch = useCallback(
    (match: FindMatch) => {
      const targetRow = match.row
      const targetCol = match.col ?? 0

      // Auto-expand collapsed section containing this row.
      const fr = flatRows[targetRow]
      if (fr) {
        const { sectionId } = fr
        if (collapsed[sectionId]) {
          setCollapsed((prev) => ({ ...prev, [sectionId]: false }))
        }
      }

      // Move selection to the matched cell.
      setSelection(collapseTo({ row: targetRow, col: targetCol }))

      // Highlight ring: set immediately, clear after 500 ms.
      if (match.col !== null) {
        setHighlightCell({ row: targetRow, col: targetCol })
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
        highlightTimeoutRef.current = setTimeout(() => setHighlightCell(null), 500)
      }

      // Scroll the matched cell into view.
      // Double-rAF: first frame lets React commit the state (e.g. section expand),
      // second frame ensures the newly rendered rows are in the DOM before querying.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = gridRootRef.current ?? document
          const el = container.querySelector(
            `[data-row="${targetRow}"][data-col="${targetCol}"]`,
          ) as HTMLElement | null
          el?.scrollIntoView({ block: 'nearest' })
        })
      })
    },
    [flatRows, collapsed],
  )

  const handleFindNext = useCallback(() => {
    if (matches.length === 0) return
    const nextCursor = nextMatchIndex(matchCursor, matches.length)
    setMatchCursor(nextCursor)
    const match = matches[nextCursor]
    if (match) navigateToMatch(match)
  }, [matches, matchCursor, navigateToMatch])

  const handleFindPrev = useCallback(() => {
    if (matches.length === 0) return
    const prevCursor = prevMatchIndex(matchCursor, matches.length)
    setMatchCursor(prevCursor)
    const match = matches[prevCursor]
    if (match) navigateToMatch(match)
  }, [matches, matchCursor, navigateToMatch])

  const handleFindClose = useCallback(() => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    setFindOpen(false)
    setFindQuery('')
    setOnlyMatching(false)
    setMatchCursor(null)
    setHighlightCell(null)
    // Restore focus to the grid after close so keyboard nav continues.
    gridRootRef.current?.focus()
  }, [])

  // ── Multi-cell selection: mouse drag + Shift+arrow extend ────────────────
  const isDraggingRef = useRef(false)

  // ── Fill-handle drag state ────────────────────────────────────────────────
  const isFillDraggingRef = useRef(false)
  const fillSourceRef = useRef<
    | { rowStart: number; rowEnd: number; colStart: number; colEnd: number }
    | null
  >(null)
  const [fillPreviewRange, setFillPreviewRange] = useState<
    { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null
  >(null)

  // Extract {row, col} from a DOM event targeting a cell with data-row/col.
  const cellFromEvent = useCallback((target: EventTarget | null): { row: number; col: number } | null => {
    if (!(target instanceof Element)) return null
    const td = target.closest('td[data-row]') as HTMLElement | null
    if (!td) return null
    const row = Number(td.dataset.row)
    const col = Number(td.dataset.col)
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null
    return { row, col }
  }, [])

  const handleGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const cell = cellFromEvent(e.target)
      if (!cell) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        // Ctrl/Cmd+Click toggles this cell in the extras set without
        // affecting the rectangular range. Focus moves so keyboard ops
        // still have a reference. No drag starts.
        e.preventDefault()
        const key = extraCellKey(cell.row, cell.col)
        setExtraSelected((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
        setSelection(collapseTo(cell))
        return
      }
      if (e.shiftKey && selection) {
        // Extend current selection without starting a drag.
        setSelection((prev) => (prev ? extendSelection(prev, cell) : collapseTo(cell)))
        e.preventDefault()
        return
      }
      // Begin a fresh drag-selection. Plain click also clears extras so
      // the two selection models don't silently accumulate.
      setExtraSelected(new Set())
      setSelection(collapseTo(cell))
      isDraggingRef.current = true
    },
    [cellFromEvent, extraCellKey, selection],
  )

  // Global listeners for drag-in-progress (mousemove extends, mouseup ends).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      const cell = cellFromEvent(e.target)
      if (!cell) return
      setSelection((prev) => {
        if (!prev) return collapseTo(cell)
        if (prev.focus.row === cell.row && prev.focus.col === cell.col) return prev
        return extendSelection(prev, cell)
      })
    }
    const onUp = () => {
      isDraggingRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [cellFromEvent])

  // ── Fill-handle drag: mousedown on handle → track move → commit on up ────
  const handleFillStart = useCallback(() => {
    if (!range) return
    isFillDraggingRef.current = true
    fillSourceRef.current = { ...range }
    setFillPreviewRange({ ...range })
  }, [range])

  /** Shared commit logic used by both drag-release and double-click fill. */
  const commitFillRange = useCallback(
    (
      source: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
      targetCells: Array<{ row: number; col: number }>,
      previewRange: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
    ) => {
      const sourceCells: Array<{ row: number; col: number; amount: number }> = []
      for (let r = source.rowStart; r <= source.rowEnd; r++) {
        for (let c = source.colStart; c <= source.colEnd; c++) {
          const fr = flatRows[r]
          const p = periods[c]
          let amount = 0
          if (fr && fr.kind === 'item' && p) {
            amount = fr.lineByPeriod.get(p.id)?.amount ?? 0
          }
          sourceCells.push({ row: r, col: c, amount })
        }
      }
      const fillPattern = detectPattern(sourceCells)
      const fillValues = materialisePattern(fillPattern, targetCells.length)

      const updates: Array<{ id: string; amount: number }> = []
      let skippedPipeline = 0
      let skippedNoLine = 0
      let skippedNonItem = 0
      let targetIdx = 0
      for (const { row, col } of targetCells) {
        const value = fillValues[targetIdx++] ?? 0
        const fr = flatRows[row]
        const p = periods[col]
        if (!fr || !p) continue
        if (fr.kind !== 'item') { skippedNonItem++; continue }
        if (fr.isPipeline) { skippedPipeline++; continue }
        const line = fr.lineByPeriod.get(p.id)
        if (!line) { skippedNoLine++; continue }
        if (line.source === 'pipeline') { skippedPipeline++; continue }
        updates.push({ id: line.id, amount: value })
      }

      if (updates.length > 0) saveUpdates(updates)

      setSelection({
        anchor: { row: previewRange.rowStart, col: previewRange.colStart },
        focus: { row: previewRange.rowEnd, col: previewRange.colEnd },
      })
      setFillPreviewRange(null)

      if (
        process.env.NODE_ENV === 'development' &&
        skippedPipeline + skippedNoLine + skippedNonItem > 0
      ) {
        console.log(
          `Fill: wrote ${updates.length} cells (skipped ${skippedPipeline} pipeline, ${skippedNoLine} no-line, ${skippedNonItem} non-item)`,
        )
      }
    },
    [flatRows, periods, saveUpdates],
  )

  /**
   * Double-click on the fill handle: auto-fill DOWN from the source range to
   * the last focusable row before the next section header (or end of flatRows).
   */
  const handleFillDoubleClick = useCallback(() => {
    if (!range) return
    const source = range
    const rowMax = flatRows.length - 1
    const colMax = periods.length - 1

    // Walk forward from rowEnd+1; stop at the first sectionHeader row or EOL.
    let targetRowEnd = -1
    for (let r = source.rowEnd + 1; r <= rowMax; r++) {
      const fr = flatRows[r]
      if (!fr) break
      if (fr.kind === 'sectionHeader') break
      if (isFocusable(fr)) targetRowEnd = r
    }

    if (targetRowEnd < 0) return // no focusable rows below

    const { previewRange, targetCells } = computeFillHandleRange({
      sourceSelection: source,
      mouseCell: { row: targetRowEnd, col: source.colEnd },
      rowMax,
      colMax,
    })

    if (targetCells.length === 0) return
    commitFillRange(source, targetCells, previewRange)
  }, [range, flatRows, periods.length, commitFillRange]) // periods.length only — colMax is the only use

  useEffect(() => {
    const rowMax = flatRows.length - 1
    const colMax = periods.length - 1

    const onMove = (e: MouseEvent) => {
      if (!isFillDraggingRef.current || !fillSourceRef.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!(el instanceof Element)) return
      const td = el.closest('td[data-row]') as HTMLElement | null
      if (!td) return
      const row = Number(td.dataset.row)
      const col = Number(td.dataset.col)
      if (!Number.isFinite(row) || !Number.isFinite(col)) return
      const { previewRange } = computeFillHandleRange({
        sourceSelection: fillSourceRef.current,
        mouseCell: { row, col },
        rowMax,
        colMax,
      })
      setFillPreviewRange((prev) => {
        if (
          prev &&
          prev.rowStart === previewRange.rowStart &&
          prev.rowEnd === previewRange.rowEnd &&
          prev.colStart === previewRange.colStart &&
          prev.colEnd === previewRange.colEnd
        ) {
          return prev
        }
        return previewRange
      })
    }

    const onUp = (e: MouseEvent) => {
      if (!isFillDraggingRef.current || !fillSourceRef.current) return
      isFillDraggingRef.current = false
      // Also make sure the normal selection-drag flag is off (the initial
      // mousedown on the handle stops propagation so it shouldn't be set,
      // but belt-and-braces).
      isDraggingRef.current = false

      const source = fillSourceRef.current
      fillSourceRef.current = null

      // Find the cell under the mouse at release.
      const el = document.elementFromPoint(e.clientX, e.clientY)
      let mouseRow = source.rowEnd
      let mouseCol = source.colEnd
      if (el instanceof Element) {
        const td = el.closest('td[data-row]') as HTMLElement | null
        if (td) {
          const r = Number(td.dataset.row)
          const c = Number(td.dataset.col)
          if (Number.isFinite(r) && Number.isFinite(c)) {
            mouseRow = r
            mouseCol = c
          }
        }
      }

      const { previewRange, targetCells } = computeFillHandleRange({
        sourceSelection: source,
        mouseCell: { row: mouseRow, col: mouseCol },
        rowMax,
        colMax,
      })

      if (targetCells.length > 0) commitFillRange(source, targetCells, previewRange)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!isFillDraggingRef.current) return
      // Cancel the in-progress fill: reset all drag state without committing
      // any updates. Prevents stale source/preview from firing on next mouseup.
      isFillDraggingRef.current = false
      fillSourceRef.current = null
      setFillPreviewRange(null)
      e.preventDefault()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [flatRows, periods, commitFillRange])

  // Click outside the grid clears the selection.
  const gridRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!gridRootRef.current) return
      if (e.target instanceof Node && !gridRootRef.current.contains(e.target)) {
        setSelection(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  // Build a 2D grid of numeric values for a selection range.
  const buildCopyGrid = useCallback(
    (r: { rowStart: number; rowEnd: number; colStart: number; colEnd: number }): Array<Array<number | null>> => {
      const out: Array<Array<number | null>> = []
      for (let row = r.rowStart; row <= r.rowEnd; row++) {
        const rowArr: Array<number | null> = []
        const fr = flatRows[row]
        for (let col = r.colStart; col <= r.colEnd; col++) {
          const period = periods[col]
          if (!fr || fr.kind !== 'item' || !period) {
            rowArr.push(null)
            continue
          }
          const line = fr.lineByPeriod.get(period.id)
          rowArr.push(line ? line.amount : null)
        }
        out.push(rowArr)
      }
      return out
    },
    [flatRows, periods],
  )

  // Apply a parsed clipboard grid starting at (rowStart, colStart) of the
  // current selection. Returns summary counts.
  const applyPasteGrid = useCallback(
    (grid: string[][], rowStart: number, colStart: number) => {
      const updates: Array<{ id: string; amount: number }> = []
      let skippedPipeline = 0
      let skippedNonNumeric = 0
      let skippedNoLine = 0
      let skippedOutOfBounds = 0
      let skippedNonItem = 0

      for (let dr = 0; dr < grid.length; dr++) {
        const targetRow = rowStart + dr
        if (targetRow >= flatRows.length) {
          skippedOutOfBounds += grid[dr]!.length
          continue
        }
        const fr = flatRows[targetRow]!
        const row = grid[dr]!
        for (let dc = 0; dc < row.length; dc++) {
          const targetCol = colStart + dc
          if (targetCol >= periods.length) {
            skippedOutOfBounds++
            continue
          }
          if (fr.kind !== 'item') {
            skippedNonItem++
            continue
          }
          const period = periods[targetCol]!
          const line = fr.lineByPeriod.get(period.id)
          if (!line) {
            skippedNoLine++
            continue
          }
          if (line.source === 'pipeline' || fr.isPipeline) {
            skippedPipeline++
            continue
          }
          const raw = row[dc] ?? ''
          const parsed = parseClipboardNumber(raw)
          if (parsed === null) {
            skippedNonNumeric++
            continue
          }
          updates.push({ id: line.id, amount: parsed })
        }
      }

      if (updates.length > 0) saveUpdates(updates)

      if (process.env.NODE_ENV === 'development') {
        console.log(
          `Pasted ${updates.length} cells, skipped ${skippedPipeline} pipeline, skipped ${skippedNonNumeric} non-numeric` +
            (skippedNoLine + skippedOutOfBounds + skippedNonItem > 0
              ? ` (+${skippedNoLine} no-line, +${skippedOutOfBounds} out-of-bounds, +${skippedNonItem} non-item)`
              : ''),
        )
      }
    },
    [flatRows, periods, saveUpdates],
  )

  // ── Undo / Redo replay ────────────────────────────────────────────────────

  const replayUndo = useCallback(async () => {
    const entry = undoStackRef.current.undo()
    if (!entry) return

    if (!entryReplayable(entry, scenarioId)) {
      markError('Skipped: scenario changed')
      return
    }

    if (entry.kind === 'created' && entry.realId === null) {
      markError('Wait — save in flight')
      // Put the entry back so the user can retry once patchRealId has resolved.
      // pushUndoPreserveRedo does NOT clear the redo stack (unlike push).
      undoStackRef.current.pushUndoPreserveRedo(entry)
      return
    }

    isReplayingRef.current = true
    try {
      if (entry.kind === 'amounts') {
        saveUpdates(entry.inverse)
      } else if (entry.kind === 'status') {
        // Apply locally first (optimistic), then confirm with server.
        const prevMap = entry.prev
        const nextStatus = entry.next
        const idSet = new Set(entry.ids)
        setLocalLines((cur) =>
          cur.map((l) => (prevMap.has(l.id) ? { ...l, lineStatus: prevMap.get(l.id)! } : l)),
        )
        const batches = groupByPrevStatus(entry.prev)
        let serverError = false
        for (const batch of batches) {
          const res = await bulkUpdateLineStatus({ ids: batch.ids, status: batch.status })
          if ('error' in res) {
            markError(res.error)
            serverError = true
            break
          }
        }
        if (serverError) {
          // Roll back the optimistic local flip — restore the `next` status.
          setLocalLines((cur) =>
            cur.map((l) => (idSet.has(l.id) ? { ...l, lineStatus: nextStatus } : l)),
          )
          return
        }
      } else if (entry.kind === 'created') {
        // realId is guaranteed non-null here (checked above).
        // Option A: capture the full ForecastLine BEFORE deleting so we can
        // push a `deleted`-kind entry onto the redo stack.  That way `replayRedo`
        // hits the existing `deleted` branch which calls bulkAddForecastLines.
        const lineSnapshot = localLinesRef.current.find((l) => l.id === entry.realId) ?? null
        const res = await deleteForecastLine(entry.realId!)
        if (res && 'error' in res) {
          markError(res.error ?? 'Delete failed')
          return
        }
        setLocalLines((cur) => cur.filter((l) => l.id !== entry.realId))
        // Push a synthetic `deleted` entry (not the original `created`) so redo
        // can re-create the line via the existing bulkAddForecastLines path.
        if (lineSnapshot !== null) {
          undoStackRef.current.pushRedo({
            kind: 'deleted',
            lines: [lineSnapshot],
            label: entry.label,
            scenarioId: entry.scenarioId,
          })
        }
        markUndone()
        return // already pushed redo above; skip the generic pushRedo below
      } else if (entry.kind === 'deleted') {
        const result = await bulkAddForecastLines(entry.lines)
        if ('error' in result) {
          markError(result.error)
          return
        }
        setLocalLines((cur) => [...cur, ...result.data])
      } else if (entry.kind === 'compound') {
        // Delegate to each sub-entry's existing replay path in order.
        // isReplayingRef is already true so sub-entry replays won't push
        // new entries onto the stack.
        //
        // We also build a transformed `entries` array for the redo compound:
        // `created` sub-entries are converted to `deleted` sub-entries (Option A)
        // so that replayRedo's `deleted` branch can re-create lines via
        // bulkAddForecastLines. This mirrors the standalone `created` case above.
        const createdSnapshots = new Map<string, AtomicUndoEntry & { kind: 'deleted' }>()

        for (const sub of entry.entries) {
          if (sub.kind === 'amounts') {
            saveUpdates(sub.inverse)
          } else if (sub.kind === 'created') {
            if (sub.realId === null) {
              markError('Wait — save in flight')
              undoStackRef.current.pushUndoPreserveRedo(entry)
              return
            }
            const lineSnapshot = localLinesRef.current.find((l) => l.id === sub.realId) ?? null
            const res = await deleteForecastLine(sub.realId)
            if (res && 'error' in res) {
              // Mid-loop failure: push the ORIGINAL compound back onto undo so
              // the user can retry once the server recovers. Sub-entries already
              // processed have mutated local state but this is the best we can do
              // without a full two-phase commit. The user sees an error chip and
              // Ctrl+Z remains available for retry.
              undoStackRef.current.pushUndoPreserveRedo(entry)
              markError(res.error ?? 'Delete failed')
              return
            }
            setLocalLines((cur) => cur.filter((l) => l.id !== sub.realId))
            // Store the snapshot keyed by tempId so we can convert this
            // sub-entry to `deleted` when building the redo compound below.
            if (lineSnapshot) {
              createdSnapshots.set(sub.tempId, {
                kind: 'deleted',
                lines: [lineSnapshot],
                label: sub.label,
                scenarioId: sub.scenarioId,
              })
            }
          } else if (sub.kind === 'deleted') {
            const result = await bulkAddForecastLines(sub.lines)
            if ('error' in result) {
              // Mid-loop failure: push original compound back for retry (same
              // rationale as the deleteForecastLine failure case above).
              undoStackRef.current.pushUndoPreserveRedo(entry)
              markError(result.error)
              return
            }
            setLocalLines((cur) => [...cur, ...result.data])
          }
          // 'status' sub-entries are not produced by shift but supported for completeness;
          // they require async batches — skip for now (compound is only used for shift).
        }

        // Build the transformed compound for the redo stack: swap each `created`
        // sub-entry that has a captured snapshot to its corresponding `deleted`
        // sub-entry. All other sub-entries pass through unchanged.
        const redoEntries = entry.entries.map((sub): AtomicUndoEntry => {
          if (sub.kind === 'created') {
            const converted = createdSnapshots.get(sub.tempId)
            if (converted) return converted
          }
          return sub
        })
        undoStackRef.current.pushRedo({ ...entry, entries: redoEntries })
        markUndone()
        return // already pushed redo above; skip generic pushRedo below
      }
      undoStackRef.current.pushRedo(entry)
      markUndone()
    } finally {
      isReplayingRef.current = false
    }
  }, [saveUpdates, scenarioId, markError, markUndone])

  const replayRedo = useCallback(async () => {
    const entry = undoStackRef.current.redo()
    if (!entry) return

    if (!entryReplayable(entry, scenarioId)) {
      markError('Skipped: scenario changed')
      return
    }

    isReplayingRef.current = true
    try {
      if (entry.kind === 'amounts') {
        saveUpdates(entry.forward)
      } else if (entry.kind === 'status') {
        // Apply locally first (optimistic), then confirm with server.
        // On server error, roll back the optimistic local flip (undo the redo).
        const nextStatus = entry.next
        const idSet = new Set(entry.ids)
        const prevMap = entry.prev
        setLocalLines((cur) =>
          cur.map((l) => (idSet.has(l.id) ? { ...l, lineStatus: nextStatus } : l)),
        )
        const res = await bulkUpdateLineStatus({ ids: entry.ids, status: entry.next })
        if ('error' in res) {
          markError(res.error)
          // Roll back to the pre-redo (i.e. post-undo) status for each line.
          setLocalLines((cur) =>
            cur.map((l) => (prevMap.has(l.id) ? { ...l, lineStatus: prevMap.get(l.id)! } : l)),
          )
          return
        }
      } else if (entry.kind === 'created') {
        // Redo of a cell-create: the undo path converts `created` entries to
        // `deleted` entries on the redo stack (Option A), so this branch is
        // only reached for legacy entries that never went through an undo.
        // Silently discard — no full payload available.
      } else if (entry.kind === 'deleted') {
        const results = await Promise.all(entry.lines.map((l) => deleteForecastLine(l.id)))
        const firstErr = results.find((r) => r && 'error' in r)
        if (firstErr && 'error' in firstErr) {
          markError((firstErr as { error: string }).error)
          return
        }
        const idsToRemove = new Set(entry.lines.map((l) => l.id))
        setLocalLines((cur) => cur.filter((l) => !idsToRemove.has(l.id)))
      } else if (entry.kind === 'compound') {
        // Replay forward: each sub-entry's redo path, in order.
        //
        // Symmetry with replayUndo's compound branch (Option A):
        // When a `deleted` sub-entry is re-created via bulkAddForecastLines,
        // we convert it back to a `created` sub-entry (using the new realId
        // returned by the server) on the compound that goes back onto the undo
        // stack. This keeps undo→redo→undo→redo cycles idempotent.
        const deletedToCreated = new Map<string, AtomicUndoEntry & { kind: 'created' }>()

        for (const sub of entry.entries) {
          if (sub.kind === 'amounts') {
            saveUpdates(sub.forward)
          } else if (sub.kind === 'created') {
            // `created` sub-entries on the redo stack are no-ops — they were
            // converted to `deleted` during undo (Option A), so re-create is
            // handled by the `deleted` sub-entry. Legacy entries silently pass.
          } else if (sub.kind === 'deleted') {
            const result = await bulkAddForecastLines(sub.lines)
            if ('error' in result) {
              markError(result.error)
              return
            }
            // Guard against partial server success: if we got fewer rows back
            // than requested, the redo is incomplete — do not push a partial
            // compound onto the undo stack as it would diverge state on the
            // next Ctrl+Z.
            if (result.data.length !== sub.lines.length) {
              markError('Re-create returned incomplete data')
              return
            }
            setLocalLines((cur) => [...cur, ...result.data])
            // Convert back to `created` sub-entry for the undo stack using a
            // stable (entityId, categoryId, periodId) keyed lookup so that
            // server re-ordering does not corrupt the mapping.
            const reByKey = new Map<string, ForecastLine>()
            for (const row of result.data) {
              reByKey.set(`${row.entityId}|${row.categoryId}|${row.periodId}`, row)
            }
            if (sub.lines.length > 0) {
              const originalLine = sub.lines[0]!
              const reKey = `${originalLine.entityId}|${originalLine.categoryId}|${originalLine.periodId}`
              const newLine = reByKey.get(reKey) ?? result.data[0]
              if (newLine) {
                deletedToCreated.set(originalLine.id, {
                  kind: 'created',
                  // tempId is not recoverable; use the new realId as a stable key.
                  // The undo stack only needs tempId to patch future server responses,
                  // which won't happen for these already-settled entries.
                  tempId: newLine.id,
                  realId: newLine.id,
                  label: sub.label,
                  scenarioId: sub.scenarioId,
                })
              }
            }
          }
        }

        // Build transformed compound for undo stack: swap each `deleted` sub-entry
        // that was re-created back to a `created` sub-entry so the next undo can
        // delete it again (via the standard `created` undo path).
        const undoEntries = entry.entries.map((sub): AtomicUndoEntry => {
          if (sub.kind === 'deleted' && sub.lines.length > 0) {
            const originalLine = sub.lines[0]!
            const converted = deletedToCreated.get(originalLine.id)
            if (converted) return converted
          }
          return sub
        })
        undoStackRef.current.pushUndoAfterRedo({ ...entry, entries: undoEntries })
        markRedone()
        return
      }
      undoStackRef.current.pushUndoAfterRedo(entry)
      markRedone()
    } finally {
      isReplayingRef.current = false
    }
  }, [saveUpdates, scenarioId, markError, markRedone])

  // Container keydown: Shift+arrow extends; Escape clears; Ctrl/Cmd+C/V copies/pastes.
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // ── Open Find bar: Ctrl/Cmd+F ─────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        const active = document.activeElement
        if (active && active.tagName === 'INPUT') return
        e.preventDefault()
        setFindOpen(true)
        return
      }

      if (e.key === 'Escape') {
        if (selection || extraSelected.size > 0) {
          setSelection(null)
          setExtraSelected(new Set())
          e.preventDefault()
        }
        return
      }

      // ── Undo / Redo: Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y ─────────────
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
        const active = document.activeElement
        if (active && active.tagName === 'INPUT') return

        if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
          e.preventDefault()
          void replayUndo()
          return
        }
        if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) {
          e.preventDefault()
          void replayRedo()
          return
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault()
          void replayRedo()
          return
        }
      }

      // ── Clipboard: Ctrl/Cmd+C / Ctrl/Cmd+V ────────────────────────────────
      if (mod && (e.key === 'c' || e.key === 'C' || e.key === 'v' || e.key === 'V')) {
        // If focus is inside an editing <input>, let the input handle it natively.
        const active = document.activeElement
        if (active && active.tagName === 'INPUT') return

        // Need the Clipboard API. Surface to the user, not just the console.
        if (typeof navigator === 'undefined' || !navigator.clipboard) {
          markError('Clipboard not available — app must run over HTTPS or localhost')
          return
        }

        if (e.key === 'c' || e.key === 'C') {
          if (!selection || !range) return
          const grid = buildCopyGrid(range)
          const tsv = toTSV(grid)
          e.preventDefault()
          navigator.clipboard.writeText(tsv).then(
            () => {
              if (process.env.NODE_ENV === 'development') {
                const rows = grid.length
                const cols = grid[0]?.length ?? 0
                console.log(`Copied ${rows}x${cols}`)
              }
            },
            (err) => {
              markError('Copy failed — clipboard permission denied')
              if (process.env.NODE_ENV === 'development') {
                console.warn('Clipboard writeText rejected:', err)
              }
            },
          )
          return
        }

        // Paste
        if (!selection || !range) return
        e.preventDefault()
        const originRow = range.rowStart
        const originCol = range.colStart
        navigator.clipboard.readText().then(
          (text) => {
            const grid = parseTSV(text)
            if (grid.length === 0) {
              markError('Clipboard is empty')
              return
            }
            applyPasteGrid(grid, originRow, originCol)
          },
          (err) => {
            markError('Paste failed — clipboard permission denied')
            if (process.env.NODE_ENV === 'development') {
              console.warn('Clipboard readText rejected:', err)
            }
          },
        )
        return
      }

      // ── Alt+←/→: shift selected cells by ±1 week (auto-confirm, no prompt) ──
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const activeEl = document.activeElement
        if (activeEl && activeEl.tagName === 'INPUT') return
        e.preventDefault()
        const shiftDir = e.key === 'ArrowRight' ? 1 : -1
        void handleShiftRef.current(shiftDir, { autoConfirm: true })
        return
      }

      // ── Delete / Backspace: clear amounts for selected cells ─────────────
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
      ) {
        const active = document.activeElement
        if (active && active.tagName === 'INPUT') return
        if (selectedCellKeysSizeRef.current === 0) return
        handleDeleteSelectionRef.current()
        e.preventDefault()
        return
      }

      // ── Ctrl/Cmd+D: duplicate selected cells to the next column ──────────
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey && !e.altKey &&
        (e.key === 'd' || e.key === 'D')
      ) {
        const active = document.activeElement
        if (active && active.tagName === 'INPUT') return
        if (selectedCellKeysSizeRef.current === 0) return
        void handleDuplicateRightRef.current()
        e.preventDefault()
        return
      }

      // ── Ctrl+Home: jump to first focusable cell ─────────────────────────
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'Home') {
        const active = document.activeElement
        if (active && active.tagName === 'INPUT') return
        for (let r = 0; r < flatRows.length; r++) {
          if (isFocusable(flatRows[r])) {
            setSelection(collapseTo({ row: r, col: 0 }))
            break
          }
        }
        e.preventDefault()
        return
      }

      // ── Ctrl+End: jump to last focusable cell ────────────────────────────
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'End') {
        const active = document.activeElement
        if (active && active.tagName === 'INPUT') return
        for (let r = flatRows.length - 1; r >= 0; r--) {
          if (isFocusable(flatRows[r])) {
            setSelection(collapseTo({ row: r, col: periods.length - 1 }))
            break
          }
        }
        e.preventDefault()
        return
      }

      // ── Ctrl+Arrow: Excel-style edge jump ───────────────────────────────
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const dir: 'up' | 'down' | 'left' | 'right' | null =
          e.key === 'ArrowUp' ? 'up'
          : e.key === 'ArrowDown' ? 'down'
          : e.key === 'ArrowLeft' ? 'left'
          : e.key === 'ArrowRight' ? 'right'
          : null
        if (dir) {
          const active = document.activeElement
          if (active && active.tagName === 'INPUT') return
          if (!selection) return
          const { row, col } = selection.focus
          const next = jumpToEdge(row, col, dir, flatRows, periods)
          setSelection(collapseTo(next))
          e.preventDefault()
          return
        }
      }

      if (!e.shiftKey) return
      if (!selection) return
      // Only act on Shift+Arrow; Shift+Tab etc is handled by the cell itself.
      const dir: Direction | null =
        e.key === 'ArrowUp' ? 'up'
          : e.key === 'ArrowDown' ? 'down'
            : e.key === 'ArrowLeft' ? 'left'
              : e.key === 'ArrowRight' ? 'right'
                : null
      if (!dir) return
      // If the active element is an <input> we're editing — let InlineCell handle it.
      const active = document.activeElement
      if (active && active.tagName === 'INPUT') return

      const rowMax = flatRows.length - 1
      const colMax = periods.length - 1
      if (rowMax < 0 || colMax < 0) return
      setSelection((prev) => (prev ? extendByArrow(prev, dir, rowMax, colMax, isFocusableRow) : prev))
      e.preventDefault()
    },
    [selection, extraSelected, range, flatRows, periods, isFocusableRow, buildCopyGrid, applyPasteGrid, replayUndo, replayRedo, markError],
  )

  // ── Subtotal proration handler ────────────────────────────────────────────

  const handleSubtotalSave = useCallback(
    (subCategoryIds: string[], periodId: string, newTotal: number) => {
      const result = prorateSubtotal(localLines, subCategoryIds, periodId, newTotal)
      if (result.reason === 'no-lines') {
        // No existing lines for this subcategory in this period — create one.
        handleEmptySubtotalCreate(subCategoryIds, periodId, newTotal)
        return
      }
      if (result.reason === 'all-pipeline') {
        markError('Cannot edit: all lines in this sub-category are pipeline-synced — edit in Pipeline page')
        return
      }
      if (result.changed.length === 0) return
      saveUpdates(result.changed)
    },
    [localLines, saveUpdates, handleEmptySubtotalCreate, markError],
  )

  // ── Multi-cell status change ──────────────────────────────────────────────

  // Union of the range selection and the Ctrl-click extras, as a Set of
  // `row:col` keys. Used by both the status bar and the highlight test.
  const selectedCellKeys = useMemo(() => {
    const keys = new Set<string>(extraSelected)
    if (range) {
      for (const { row, col } of iterateRange(range)) {
        keys.add(extraCellKey(row, col))
      }
    }
    return keys
  }, [range, extraSelected, extraCellKey])

  const hasAnySelection = selectedCellKeys.size > 0

  // ── P3.4: derived grouping eligibility ───────────────────────────────────
  // "Group" is enabled when ≥2 distinct item rows are selected and all of
  // them share the same sub-category (subId). We derive this from the flat
  // rows referenced by the current selection.
  const groupCandidates = useMemo((): {
    canGroup: boolean
    subId: string | null
    itemRowIndices: number[]
    /** All line IDs that appear in the selected item rows. */
    lineIds: string[]
    /** Categories object for the shared sub-category. */
    subCategory: Category | null
  } => {
    const itemRowIndices = new Set<number>()
    for (const key of selectedCellKeys) {
      const row = Number(key.split(':')[0])
      const fr = flatRows[row]
      if (fr?.kind === 'item' && !fr.isPipeline) {
        itemRowIndices.add(row)
      }
    }
    if (itemRowIndices.size < 2) {
      return { canGroup: false, subId: null, itemRowIndices: [], lineIds: [], subCategory: null }
    }
    // Check all selected item rows share the same subId.
    // subId is the first sub-category that contains the item's categoryId.
    const subIds = new Set<string>()
    const lineIds: string[] = []
    for (const rowIdx of itemRowIndices) {
      const fr = flatRows[rowIdx]
      if (fr?.kind !== 'item') continue
      lineIds.push(...fr.lineIds)
      // Find which sub-category owns this item's first line's categoryId.
      const firstLineId = fr.lineIds[0]
      const firstLine = localLines.find((l) => l.id === firstLineId)
      if (!firstLine) continue
      // Walk up the category hierarchy to find the direct child of the section.
      const cat = categories.find((c) => c.id === firstLine.categoryId)
      if (!cat) continue
      // If the cat itself is a direct child of a section (parentId is a section root),
      // its subId is cat.id. If it's a grandchild, subId is its parent.
      const parent = categories.find((c) => c.id === cat.parentId)
      if (!parent) continue
      const grandparent = categories.find((c) => c.id === parent.parentId)
      if (grandparent === undefined) {
        // parent is a section root → cat is the sub-category
        subIds.add(cat.id)
      } else {
        // cat is a grandchild → parent is the sub-category
        subIds.add(parent.id)
      }
    }
    const canGroup = subIds.size === 1
    const subId = canGroup ? Array.from(subIds)[0]! : null
    const subCategory = subId ? (categories.find((c) => c.id === subId) ?? null) : null
    return {
      canGroup,
      subId,
      itemRowIndices: Array.from(itemRowIndices),
      lineIds,
      subCategory,
    }
  }, [selectedCellKeys, flatRows, localLines, categories])

  const canGroup = groupCandidates.canGroup

  // Numeric values behind the current selection, for the aggregate chip.
  // Item cells contribute the line amount (or 0 for empty). Subtotal cells
  // contribute the derived per-period total across their sub-categories.
  // Header and pipeline rows are skipped.
  const selectionAggregates: Aggregates | null = useMemo(() => {
    if (selectedCellKeys.size < 2) return null
    const values: number[] = []
    for (const key of selectedCellKeys) {
      const [rowStr, colStr] = key.split(':')
      const row = Number(rowStr)
      const col = Number(colStr)
      const fr = flatRows[row]
      const period = periods[col]
      if (!fr || !period) continue
      if (fr.kind === 'item') {
        const line = fr.lineByPeriod.get(period.id)
        values.push(line?.amount ?? 0)
      } else if (fr.kind === 'subtotal') {
        const catSet = new Set(fr.subCategoryIds)
        let total = 0
        for (const l of localLines) {
          if (l.periodId === period.id && catSet.has(l.categoryId)) {
            total += l.amount
          }
        }
        values.push(total)
      }
    }
    if (values.length < 2) return null
    return computeAggregates(values)
  }, [selectedCellKeys, flatRows, periods, localLines])

  const handleSetStatus = useCallback(
    (status: LineStatus) => {
      const lineIds: string[] = []
      const seen = new Set<string>()
      for (const key of selectedCellKeys) {
        const [rowStr, colStr] = key.split(':')
        const row = Number(rowStr)
        const col = Number(colStr)
        const fr = flatRows[row]
        const period = periods[col]
        if (!fr || fr.kind !== 'item' || !period) continue
        if (fr.isPipeline) continue
        const line = fr.lineByPeriod.get(period.id)
        if (!line || line.source === 'pipeline') continue
        if (seen.has(line.id)) continue
        seen.add(line.id)
        lineIds.push(line.id)
      }

      if (lineIds.length === 0) {
        markError('No editable lines in the selection')
        return
      }

      // Snapshot prev statuses for revert
      const prev = new Map<string, LineStatus>()
      const idSet = new Set(lineIds)
      setLocalLines((cur) =>
        cur.map((l) => {
          if (idSet.has(l.id)) {
            prev.set(l.id, l.lineStatus)
            return { ...l, lineStatus: status }
          }
          return l
        }),
      )

      // Push undo entry BEFORE the transition (optimistic apply already done above).
      if (!isReplayingRef.current) {
        undoStackRef.current.push({
          kind: 'status',
          ids: lineIds,
          prev,
          next: status,
          label: `Status → ${humanStatusLabel(status)} (${lineIds.length} cell${lineIds.length === 1 ? '' : 's'})`,
          scenarioId,
        })
      }

      startTransition(() => {
        bulkUpdateLineStatus({ ids: lineIds, status })
          .then((res) => {
            if ('error' in res) {
              setLocalLines((cur) =>
                cur.map((l) => (prev.has(l.id) ? { ...l, lineStatus: prev.get(l.id)! } : l)),
              )
              markError(res.error)
            } else {
              markSaved()
            }
          })
          .catch((err) => {
            setLocalLines((cur) =>
              cur.map((l) => (prev.has(l.id) ? { ...l, lineStatus: prev.get(l.id)! } : l)),
            )
            markError(err instanceof Error ? err.message : 'Network error')
          })
      })
    },
    [selectedCellKeys, flatRows, periods, startTransition, markError, markSaved, scenarioId],
  )

  // ── Delete / Backspace: clear amounts for selected cells ──────────────────

  const handleDeleteSelection = useCallback(() => {
    const updates: Array<{ id: string; amount: number }> = []
    const seen = new Set<string>()
    for (const key of selectedCellKeys) {
      const [rowStr, colStr] = key.split(':')
      const row = Number(rowStr)
      const col = Number(colStr)
      const fr = flatRows[row]
      const period = periods[col]
      if (!fr || fr.kind !== 'item' || !period) continue
      if (fr.isPipeline) continue
      const line = fr.lineByPeriod.get(period.id)
      if (!line || line.source === 'pipeline') continue
      if (seen.has(line.id)) continue
      seen.add(line.id)
      updates.push({ id: line.id, amount: 0 })
    }
    if (updates.length > 0) saveUpdates(updates)
  }, [selectedCellKeys, flatRows, periods, saveUpdates])
  // Keep refs in sync so handleGridKeyDown (defined earlier) can call the latest closure.
  useEffect(() => { handleDeleteSelectionRef.current = handleDeleteSelection }, [handleDeleteSelection])
  useEffect(() => { selectedCellKeysSizeRef.current = selectedCellKeys.size }, [selectedCellKeys])

  // ── Shift-by-N-weeks ─────────────────────────────────────────────────────

  // Popover state for the "Shift…" button.
  const [shiftPopoverOpen, setShiftPopoverOpen] = useState(false)
  const [shiftN, setShiftN] = useState(1)
  const shiftButtonRef = useRef<HTMLButtonElement>(null)
  const shiftPopoverRef = useRef<HTMLDivElement>(null)

  // Close the popover when clicking outside.
  useEffect(() => {
    if (!shiftPopoverOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (
        shiftButtonRef.current?.contains(e.target as Node) ||
        shiftPopoverRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setShiftPopoverOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [shiftPopoverOpen])

  // Close on Escape.
  useEffect(() => {
    if (!shiftPopoverOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShiftPopoverOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shiftPopoverOpen])

  // ── Export button + menu ──────────────────────────────────────────────────
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportButtonRef = useRef<HTMLButtonElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Close export menu when clicking outside.
  useEffect(() => {
    if (!exportMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (
        exportButtonRef.current?.contains(e.target as Node) ||
        exportMenuRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [exportMenuOpen])

  // Close export menu on Escape.
  useEffect(() => {
    if (!exportMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [exportMenuOpen])

  const triggerExport = useCallback(
    (scope: 'all' | 'view' | 'selection') => {
      setExportMenuOpen(false)
      const csv = buildCsv({
        flatRows,
        periods,
        localLines,
        categories,
        summaries,
        scope,
        hideEmpty,
        collapsed,
        filterRowSet,
        selectedCellKeys,
      })
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `augusto-cashflow-${scope}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    [flatRows, periods, localLines, categories, summaries, hideEmpty, collapsed, filterRowSet, selectedCellKeys],
  )

  // ── P3.4: Group popover ───────────────────────────────────────────────────
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false)
  const [groupLabel, setGroupLabel] = useState('')
  const groupButtonRef = useRef<HTMLButtonElement>(null)
  const groupPopoverRef = useRef<HTMLDivElement>(null)

  // Close group popover on outside click.
  useEffect(() => {
    if (!groupPopoverOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (
        groupButtonRef.current?.contains(e.target as Node) ||
        groupPopoverRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setGroupPopoverOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [groupPopoverOpen])

  // Close group popover on Escape.
  useEffect(() => {
    if (!groupPopoverOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGroupPopoverOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [groupPopoverOpen])

  /** Create a new group from the current selection and close the popover. */
  const handleCreateGroup = useCallback(() => {
    const label = groupLabel.trim()
    if (!label || !groupCandidates.canGroup || !groupCandidates.subId) return
    const newGroup: RowGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label,
      lineIds: groupCandidates.lineIds,
      collapsed: false,
    }
    const subId = groupCandidates.subId
    setGroups((prev) => ({
      ...prev,
      [subId]: [...(prev[subId] ?? []), newGroup],
    }))
    setGroupLabel('')
    setGroupPopoverOpen(false)
  }, [groupLabel, groupCandidates, setGroups])

  /** Toggle a group's collapsed state. */
  const handleToggleGroup = useCallback(
    (subId: string, groupId: string) => {
      setGroups((prev) => ({
        ...prev,
        [subId]: (prev[subId] ?? []).map((g) =>
          g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
        ),
      }))
    },
    [setGroups],
  )

  /** Remove a group definition (member rows return to normal positions). */
  const handleUngroup = useCallback(
    (subId: string, groupId: string) => {
      setGroups((prev) => ({
        ...prev,
        [subId]: (prev[subId] ?? []).filter((g) => g.id !== groupId),
      }))
    },
    [setGroups],
  )

  /**
   * Execute a shift of N periods on the current selection.
   *
   * When `autoConfirm` is false (button Apply path) the caller should already
   * have surfaced the collision warning. When `autoConfirm` is true (keyboard
   * path) collisions are accepted silently (Excel behaviour).
   *
   * Push is deferred until `bulkAddForecastLines` resolves so we have real IDs
   * for the created sub-entries. During the round-trip the undo button is
   * briefly unavailable for this operation — acceptable, same as `saveUpdates`.
   */
  const handleShift = useCallback(
    async (n: number, { autoConfirm }: { autoConfirm: boolean }) => {
      if (n === 0) return

      const plan = planShift(selectedCellKeys, n, flatRows, periods)

      if (plan.updates.length === 0 && plan.creates.length === 0) return

      if (!autoConfirm && plan.collisions > 0) {
        // The popover already shows the collision count; apply was explicitly clicked.
        // We proceed — caller guarantees user saw the warning.
      }

      // ── Optimistic local update ─────────────────────────────────────────

      // 1. Apply all amount updates immediately (source clears + target overwrites).
      const oldAmounts = plan.updates.map((u) => ({
        id: u.id,
        amount: snapshotRef.current.get(u.id) ?? 0,
      }))
      for (const u of plan.updates) snapshotRef.current.set(u.id, u.amount)
      if (plan.updates.length > 0) applyLocal(plan.updates)

      // 2. Insert optimistic temp lines for creates.
      const tempLines: ForecastLine[] = plan.creates.map((c) => ({
        id: c.tempId,
        entityId: c.entityId,
        categoryId: c.categoryId,
        periodId: c.periodId,
        amount: c.amount,
        confidence: 100,
        source: 'manual' as const,
        counterparty: c.counterparty,
        notes: c.notes,
        sourceDocumentId: null,
        sourceRuleId: null,
        sourcePipelineProjectId: null,
        lineStatus: c.lineStatus,
        formula: null,
      }))
      if (tempLines.length > 0) {
        setLocalLines((prev) => [...prev, ...tempLines])
      }

      // ── Server calls ────────────────────────────────────────────────────

      startTransition(() => {
        const doShift = async () => {
          // Run both calls; updates can start immediately.
          const [updateResult, createResult] = await Promise.all([
            plan.updates.length > 0
              ? updateLineAmounts({ updates: plan.updates })
              : Promise.resolve({ ok: true as const, count: 0 }),
            plan.creates.length > 0
              ? bulkAddForecastLines(
                  plan.creates.map((c) => ({
                    entityId: c.entityId,
                    categoryId: c.categoryId,
                    periodId: c.periodId,
                    amount: c.amount,
                    counterparty: c.counterparty,
                    notes: c.notes,
                    lineStatus: c.lineStatus,
                    source: 'manual',
                    confidence: 100,
                  })),
                )
              : Promise.resolve({ ok: true as const, data: [] as ForecastLine[] }),
          ])

          // ── Error handling ──────────────────────────────────────────────
          if ('error' in updateResult) {
            // Revert optimistic amount updates.
            applyLocal(oldAmounts)
            for (const o of oldAmounts) snapshotRef.current.set(o.id, o.amount)
            // Revert optimistic temp lines.
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            markError(updateResult.error ?? 'Shift failed')
            return
          }

          if ('error' in createResult) {
            // Partial failure: amount updates went through, creates failed.
            // Revert only the temp lines; keep the amount updates (they're
            // already persisted). A full rollback of amounts would require
            // another round-trip which adds complexity for a rare edge case.
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            // Push a partial undo entry so the user can Ctrl+Z the amount
            // updates that did succeed, even though the creates never happened.
            if (!isReplayingRef.current && plan.updates.length > 0) {
              const partialAmountsSub: AtomicUndoEntry = {
                kind: 'amounts',
                forward: plan.updates,
                inverse: oldAmounts,
                label: 'shift amounts (partial)',
                scenarioId,
              }
              undoStackRef.current.push({
                kind: 'compound',
                entries: [partialAmountsSub],
                label: `Shift ${n > 0 ? '+' : ''}${n}w (partial)`,
                scenarioId,
              })
            }
            markError('Shift partially failed — amounts saved, new lines not created')
            return
          }

          // ── Success ──────────────────────────────────────────────────
          const createdLines = 'data' in createResult ? createResult.data : []

          // Build a stable lookup by (entityId, categoryId, periodId) so that
          // server re-ordering never assigns a realId to the wrong temp entry.
          const responseByKey = new Map<string, ForecastLine>()
          for (const row of createdLines) {
            responseByKey.set(`${row.entityId}|${row.categoryId}|${row.periodId}`, row)
          }

          // Swap temp ids for real ids.
          if (createdLines.length > 0) {
            const realByTempId = new Map<string, ForecastLine>()
            for (const c of plan.creates) {
              const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
              const real = responseByKey.get(key)
              if (real) realByTempId.set(c.tempId, real)
            }
            setLocalLines((prev) =>
              prev.map((l) => {
                const real = realByTempId.get(l.id)
                return real ?? l
              }),
            )
            for (const real of createdLines) {
              if (real) snapshotRef.current.set(real.id, real.amount)
            }
          }

          // ── Build and push compound undo entry ─────────────────────
          if (!isReplayingRef.current) {
            // amounts sub-entry: forward = updates (source clears + target overwrites),
            //                    inverse = old values (pre-shift).
            const amountsSub: AtomicUndoEntry = {
              kind: 'amounts',
              forward: plan.updates,
              inverse: oldAmounts,
              label: 'shift amounts',
              scenarioId,
            }

            // Per-line created sub-entries (one per new line, with real id now known).
            const createdSubs: AtomicUndoEntry[] = plan.creates
              .map((c) => {
                const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
                const real = responseByKey.get(key)
                if (!real) return null
                return {
                  kind: 'created' as const,
                  tempId: c.tempId,
                  realId: real.id,
                  label: '(inside shift)',
                  scenarioId,
                }
              })
              .filter((s): s is NonNullable<typeof s> => s !== null)

            const subEntries: AtomicUndoEntry[] = [
              amountsSub,
              ...createdSubs,
            ]

            undoStackRef.current.push({
              kind: 'compound',
              entries: subEntries,
              label: `Shift ${n > 0 ? '+' : ''}${n} week${Math.abs(n) === 1 ? '' : 's'} (${plan.updates.length + plan.creates.length} cell${plan.updates.length + plan.creates.length === 1 ? '' : 's'})`,
              scenarioId,
            })
          }

          markSaved()
        }

        void doShift()
      })
    },
    [selectedCellKeys, flatRows, periods, applyLocal, startTransition, markError, markSaved, scenarioId],
  )
  // Keep the ref in sync so handleGridKeyDown (defined earlier) always calls
  // the latest closure of handleShift without needing it in its own deps array.
  useEffect(() => { handleShiftRef.current = handleShift }, [handleShift])

  // ── Duplicate to next column (Ctrl+D) ────────────────────────────────────

  /**
   * Copy selected cells to the next column (col + 1) without clearing the
   * source — classic Ctrl+D / "fill right" semantics.
   *
   * Auto-overwrites any existing non-pipeline target value (no collision
   * prompt, consistent with Excel's Ctrl+D behaviour). Fully undoable via
   * Ctrl+Z (same compound-undo machinery as handleShift).
   */
  const handleDuplicateRight = useCallback(async () => {
    const plan = planShift(selectedCellKeys, 1, flatRows, periods, { clearSource: false })

    if (plan.updates.length === 0 && plan.creates.length === 0) return

    // ── Optimistic local update ───────────────────────────────────────────

    // Apply target-overwrite updates (no source clears in this plan).
    const oldAmounts = plan.updates.map((u) => ({
      id: u.id,
      amount: snapshotRef.current.get(u.id) ?? 0,
    }))
    for (const u of plan.updates) snapshotRef.current.set(u.id, u.amount)
    if (plan.updates.length > 0) applyLocal(plan.updates)

    // Insert optimistic temp lines for creates.
    const tempLines: ForecastLine[] = plan.creates.map((c) => ({
      id: c.tempId,
      entityId: c.entityId,
      categoryId: c.categoryId,
      periodId: c.periodId,
      amount: c.amount,
      confidence: 100,
      source: 'manual' as const,
      counterparty: c.counterparty,
      notes: c.notes,
      sourceDocumentId: null,
      sourceRuleId: null,
      sourcePipelineProjectId: null,
      lineStatus: c.lineStatus,
      formula: null,
    }))
    if (tempLines.length > 0) {
      setLocalLines((prev) => [...prev, ...tempLines])
    }

    // ── Server calls ──────────────────────────────────────────────────────

    startTransition(() => {
      const doDuplicate = async () => {
        const [updateResult, createResult] = await Promise.all([
          plan.updates.length > 0
            ? updateLineAmounts({ updates: plan.updates })
            : Promise.resolve({ ok: true as const, count: 0 }),
          plan.creates.length > 0
            ? bulkAddForecastLines(
                plan.creates.map((c) => ({
                  entityId: c.entityId,
                  categoryId: c.categoryId,
                  periodId: c.periodId,
                  amount: c.amount,
                  counterparty: c.counterparty,
                  notes: c.notes,
                  lineStatus: c.lineStatus,
                  source: 'manual',
                  confidence: 100,
                })),
              )
            : Promise.resolve({ ok: true as const, data: [] as ForecastLine[] }),
        ])

        // ── Error handling ────────────────────────────────────────────────
        if ('error' in updateResult) {
          applyLocal(oldAmounts)
          for (const o of oldAmounts) snapshotRef.current.set(o.id, o.amount)
          if (tempLines.length > 0) {
            const tempIds = new Set(tempLines.map((l) => l.id))
            setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
          }
          markError(updateResult.error ?? 'Duplicate failed')
          return
        }

        if ('error' in createResult) {
          if (tempLines.length > 0) {
            const tempIds = new Set(tempLines.map((l) => l.id))
            setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
          }
          if (!isReplayingRef.current && plan.updates.length > 0) {
            const partialAmountsSub: AtomicUndoEntry = {
              kind: 'amounts',
              forward: plan.updates,
              inverse: oldAmounts,
              label: 'duplicate amounts (partial)',
              scenarioId,
            }
            undoStackRef.current.push({
              kind: 'compound',
              entries: [partialAmountsSub],
              label: 'Duplicate to next week (partial)',
              scenarioId,
            })
          }
          markError('Duplicate partially failed — amounts saved, new lines not created')
          return
        }

        // ── Success ───────────────────────────────────────────────────────
        const createdLines = 'data' in createResult ? createResult.data : []

        const responseByKey = new Map<string, ForecastLine>()
        for (const row of createdLines) {
          responseByKey.set(`${row.entityId}|${row.categoryId}|${row.periodId}`, row)
        }

        // Swap temp ids for real ids.
        if (createdLines.length > 0) {
          const realByTempId = new Map<string, ForecastLine>()
          for (const c of plan.creates) {
            const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
            const real = responseByKey.get(key)
            if (real) realByTempId.set(c.tempId, real)
          }
          setLocalLines((prev) =>
            prev.map((l) => {
              const real = realByTempId.get(l.id)
              return real ?? l
            }),
          )
          for (const real of createdLines) {
            if (real) snapshotRef.current.set(real.id, real.amount)
          }
        }

        // ── Build and push compound undo entry ────────────────────────────
        if (!isReplayingRef.current) {
          const amountsSub: AtomicUndoEntry = {
            kind: 'amounts',
            forward: plan.updates,
            inverse: oldAmounts,
            label: 'duplicate amounts',
            scenarioId,
          }

          const createdSubs: AtomicUndoEntry[] = plan.creates
            .map((c) => {
              const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
              const real = responseByKey.get(key)
              if (!real) return null
              return {
                kind: 'created' as const,
                tempId: c.tempId,
                realId: real.id,
                label: '(inside duplicate)',
                scenarioId,
              }
            })
            .filter((s): s is NonNullable<typeof s> => s !== null)

          const subEntries: AtomicUndoEntry[] = [amountsSub, ...createdSubs]

          undoStackRef.current.push({
            kind: 'compound',
            entries: subEntries,
            label: 'Duplicate to next week',
            scenarioId,
          })
        }

        markSaved()
      }

      void doDuplicate()
    })
  }, [selectedCellKeys, flatRows, periods, applyLocal, startTransition, markError, markSaved, scenarioId])

  // Keep the ref in sync so handleGridKeyDown (defined earlier) always calls
  // the latest closure of handleDuplicateRight.
  useEffect(() => { handleDuplicateRightRef.current = handleDuplicateRight }, [handleDuplicateRight])

  // ── Copy forward N weeks ─────────────────────────────────────────────────

  // Popover state for the "Copy forward…" button.
  const [copyFwdOpen, setCopyFwdOpen] = useState(false)
  const [copyFwdN, setCopyFwdN] = useState(1)
  const copyFwdButtonRef = useRef<HTMLButtonElement>(null)
  const copyFwdPopoverRef = useRef<HTMLDivElement>(null)

  // Close the popover when clicking outside.
  useEffect(() => {
    if (!copyFwdOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (
        copyFwdButtonRef.current?.contains(e.target as Node) ||
        copyFwdPopoverRef.current?.contains(e.target as Node)
      ) {
        return
      }
      setCopyFwdOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [copyFwdOpen])

  // Close on Escape.
  useEffect(() => {
    if (!copyFwdOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCopyFwdOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [copyFwdOpen])

  /**
   * Merge N planShift results (offsets 1..N, clearSource=false) into one plan,
   * then commit as a single compound undo entry.
   *
   * NOTE: This duplicates the commit pipeline from handleShift / handleDuplicateRight
   * / commitSplit. Extraction into a shared helper was considered but deferred:
   * the helper would need 8+ deps threaded through its signature, and the risk of
   * regressing the existing undo/redo paths outweighed the DRY benefit for this
   * 4th caller. Document the debt here if a 5th caller appears.
   */
  const runCopyForward = useCallback(
    async (n: number) => {
      if (n < 1) return

      // ── Merge N planShift results ──────────────────────────────────────────
      const updatesById = new Map<string, ShiftAmountUpdate>()
      const createsByKey = new Map<string, ShiftCreate>()
      let totalCollisions = 0
      let totalSkipped = 0

      for (let i = 1; i <= n; i++) {
        const p = planShift(selectedCellKeys, i, flatRows, periods, { clearSource: false })
        for (const u of p.updates) updatesById.set(u.id, u) // last-write-wins
        for (const c of p.creates) {
          createsByKey.set(`${c.entityId}|${c.categoryId}|${c.periodId}`, c)
        }
        totalCollisions += p.collisions
        totalSkipped += p.skipped
      }

      const mergedUpdates = Array.from(updatesById.values())
      const mergedCreates = Array.from(createsByKey.values())

      if (mergedUpdates.length === 0 && mergedCreates.length === 0) return

      // ── Optimistic local update ────────────────────────────────────────────

      const oldAmounts = mergedUpdates.map((u) => ({
        id: u.id,
        amount: snapshotRef.current.get(u.id) ?? 0,
      }))
      for (const u of mergedUpdates) snapshotRef.current.set(u.id, u.amount)
      if (mergedUpdates.length > 0) applyLocal(mergedUpdates)

      const tempLines: ForecastLine[] = mergedCreates.map((c) => ({
        id: c.tempId,
        entityId: c.entityId,
        categoryId: c.categoryId,
        periodId: c.periodId,
        amount: c.amount,
        confidence: 100,
        source: 'manual' as const,
        counterparty: c.counterparty,
        notes: c.notes,
        sourceDocumentId: null,
        sourceRuleId: null,
        sourcePipelineProjectId: null,
        lineStatus: c.lineStatus,
        formula: null,
      }))
      if (tempLines.length > 0) {
        setLocalLines((prev) => [...prev, ...tempLines])
      }

      // ── Server calls ──────────────────────────────────────────────────────

      startTransition(() => {
        const doCopyForward = async () => {
          const [updateResult, createResult] = await Promise.all([
            mergedUpdates.length > 0
              ? updateLineAmounts({ updates: mergedUpdates })
              : Promise.resolve({ ok: true as const, count: 0 }),
            mergedCreates.length > 0
              ? bulkAddForecastLines(
                  mergedCreates.map((c) => ({
                    entityId: c.entityId,
                    categoryId: c.categoryId,
                    periodId: c.periodId,
                    amount: c.amount,
                    counterparty: c.counterparty,
                    notes: c.notes,
                    lineStatus: c.lineStatus,
                    source: 'manual',
                    confidence: 100,
                  })),
                )
              : Promise.resolve({ ok: true as const, data: [] as ForecastLine[] }),
          ])

          // ── Error handling ────────────────────────────────────────────────
          if ('error' in updateResult) {
            applyLocal(oldAmounts)
            for (const o of oldAmounts) snapshotRef.current.set(o.id, o.amount)
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            markError(updateResult.error ?? 'Copy forward failed')
            return
          }

          if ('error' in createResult) {
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            if (!isReplayingRef.current && mergedUpdates.length > 0) {
              const partialAmountsSub: AtomicUndoEntry = {
                kind: 'amounts',
                forward: mergedUpdates,
                inverse: oldAmounts,
                label: 'copy forward amounts (partial)',
                scenarioId,
              }
              undoStackRef.current.push({
                kind: 'compound',
                entries: [partialAmountsSub],
                label: `Copy forward ${n} week${n === 1 ? '' : 's'} (partial)`,
                scenarioId,
              })
            }
            markError('Copy forward partially failed — amounts saved, new lines not created')
            return
          }

          // ── Success ───────────────────────────────────────────────────────
          const createdLines = 'data' in createResult ? createResult.data : []

          const responseByKey = new Map<string, ForecastLine>()
          for (const row of createdLines) {
            responseByKey.set(`${row.entityId}|${row.categoryId}|${row.periodId}`, row)
          }

          if (createdLines.length > 0) {
            const realByTempId = new Map<string, ForecastLine>()
            for (const c of mergedCreates) {
              const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
              const real = responseByKey.get(key)
              if (real) realByTempId.set(c.tempId, real)
            }
            setLocalLines((prev) =>
              prev.map((l) => {
                const real = realByTempId.get(l.id)
                return real ?? l
              }),
            )
            for (const real of createdLines) {
              if (real) snapshotRef.current.set(real.id, real.amount)
            }
          }

          // ── Build and push compound undo entry ────────────────────────────
          if (!isReplayingRef.current) {
            const amountsSub: AtomicUndoEntry = {
              kind: 'amounts',
              forward: mergedUpdates,
              inverse: oldAmounts,
              label: 'copy forward amounts',
              scenarioId,
            }

            const createdSubs: AtomicUndoEntry[] = mergedCreates
              .map((c) => {
                const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
                const real = responseByKey.get(key)
                if (!real) return null
                return {
                  kind: 'created' as const,
                  tempId: c.tempId,
                  realId: real.id,
                  label: '(inside copy forward)',
                  scenarioId,
                }
              })
              .filter((s): s is NonNullable<typeof s> => s !== null)

            const totalCells = mergedUpdates.length + mergedCreates.length
            undoStackRef.current.push({
              kind: 'compound',
              entries: [amountsSub, ...createdSubs],
              label: `Copy forward ${n} week${n === 1 ? '' : 's'} (${totalCells} cell${totalCells === 1 ? '' : 's'})`,
              scenarioId,
            })
          }

          markSaved()
        }

        void doCopyForward()
      })
    },
    [selectedCellKeys, flatRows, periods, applyLocal, startTransition, markError, markSaved, scenarioId],
  )

  // ── Split cell modal state ────────────────────────────────────────────────

  interface SplitModalContext {
    sourceLine: ForecastLine
    sourceRow: { kind: 'item'; lineByPeriod: Map<string, ForecastLine>; isPipeline: boolean }
    sourceCol: number
    periodLabel: string
  }

  const [splitModal, setSplitModal] = useState<SplitModalContext | null>(null)

  const handleSplitCellOpen = useCallback(
    (
      e: React.MouseEvent,
      line: ForecastLine | undefined,
      periodId: string,
      colIdx: number,
      lineByPeriod: Map<string, ForecastLine>,
      isPipeline: boolean,
    ) => {
      e.preventDefault()
      // Guard: no line, pipeline row, or zero amount → do nothing.
      if (!line || isPipeline || line.amount === 0) return

      // Find the period label (week ending date).
      const period = periods.find((p) => p.id === periodId)
      const periodLabel = period ? weekEndingLabel(new Date(period.weekEnding)) : periodId

      setSplitModal({
        sourceLine: line,
        sourceRow: { kind: 'item', lineByPeriod, isPipeline },
        sourceCol: colIdx,
        periodLabel,
      })
    },
    [periods],
  )

  const commitSplit = useCallback(
    async (plan: ReturnType<typeof planSplitCell>) => {
      if (plan.updates.length === 0 && plan.creates.length === 0) return

      // ── Optimistic local update ─────────────────────────────────────────
      const oldAmounts = plan.updates.map((u) => ({
        id: u.id,
        amount: snapshotRef.current.get(u.id) ?? 0,
      }))
      for (const u of plan.updates) snapshotRef.current.set(u.id, u.amount)
      if (plan.updates.length > 0) applyLocal(plan.updates)

      const tempLines: ForecastLine[] = plan.creates.map((c) => ({
        id: c.tempId,
        entityId: c.entityId,
        categoryId: c.categoryId,
        periodId: c.periodId,
        amount: c.amount,
        confidence: 100,
        source: 'manual' as const,
        counterparty: c.counterparty,
        notes: c.notes,
        sourceDocumentId: null,
        sourceRuleId: null,
        sourcePipelineProjectId: null,
        lineStatus: c.lineStatus,
        formula: null,
      }))
      if (tempLines.length > 0) {
        setLocalLines((prev) => [...prev, ...tempLines])
      }

      // ── Server calls ────────────────────────────────────────────────────
      startTransition(() => {
        const doSplit = async () => {
          const [updateResult, createResult] = await Promise.all([
            plan.updates.length > 0
              ? updateLineAmounts({ updates: plan.updates })
              : Promise.resolve({ ok: true as const, count: 0 }),
            plan.creates.length > 0
              ? bulkAddForecastLines(
                  plan.creates.map((c) => ({
                    entityId: c.entityId,
                    categoryId: c.categoryId,
                    periodId: c.periodId,
                    amount: c.amount,
                    counterparty: c.counterparty,
                    notes: c.notes,
                    lineStatus: c.lineStatus,
                    source: 'manual',
                    confidence: 100,
                  })),
                )
              : Promise.resolve({ ok: true as const, data: [] as ForecastLine[] }),
          ])

          // ── Error handling ──────────────────────────────────────────────
          if ('error' in updateResult) {
            applyLocal(oldAmounts)
            for (const o of oldAmounts) snapshotRef.current.set(o.id, o.amount)
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            markError(updateResult.error ?? 'Split failed')
            return
          }

          if ('error' in createResult) {
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            if (!isReplayingRef.current && plan.updates.length > 0) {
              const partialAmountsSub: AtomicUndoEntry = {
                kind: 'amounts',
                forward: plan.updates,
                inverse: oldAmounts,
                label: 'split amounts (partial)',
                scenarioId,
              }
              undoStackRef.current.push({
                kind: 'compound',
                entries: [partialAmountsSub],
                label: 'Split cell (partial)',
                scenarioId,
              })
            }
            markError('Split partially failed — amounts saved, new lines not created')
            return
          }

          // ── Success ──────────────────────────────────────────────────
          const createdLines = 'data' in createResult ? createResult.data : []

          const responseByKey = new Map<string, ForecastLine>()
          for (const row of createdLines) {
            responseByKey.set(`${row.entityId}|${row.categoryId}|${row.periodId}`, row)
          }

          if (createdLines.length > 0) {
            const realByTempId = new Map<string, ForecastLine>()
            for (const c of plan.creates) {
              const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
              const real = responseByKey.get(key)
              if (real) realByTempId.set(c.tempId, real)
            }
            setLocalLines((prev) =>
              prev.map((l) => {
                const real = realByTempId.get(l.id)
                return real ?? l
              }),
            )
            for (const real of createdLines) {
              if (real) snapshotRef.current.set(real.id, real.amount)
            }
          }

          // ── Build and push compound undo entry ─────────────────────
          if (!isReplayingRef.current) {
            const amountsSub: AtomicUndoEntry = {
              kind: 'amounts',
              forward: plan.updates,
              inverse: oldAmounts,
              label: 'split amounts',
              scenarioId,
            }

            const createdSubs: AtomicUndoEntry[] = plan.creates
              .map((c) => {
                const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
                const real = responseByKey.get(key)
                if (!real) return null
                return {
                  kind: 'created' as const,
                  tempId: c.tempId,
                  realId: real.id,
                  label: '(inside split)',
                  scenarioId,
                }
              })
              .filter((s): s is NonNullable<typeof s> => s !== null)

            const totalCells = plan.updates.length + plan.creates.length
            undoStackRef.current.push({
              kind: 'compound',
              entries: [amountsSub, ...createdSubs],
              label: `Split cell across weeks (${totalCells} cell${totalCells === 1 ? '' : 's'})`,
              scenarioId,
            })
          }

          markSaved()
        }

        void doSplit()
      })
    },
    [applyLocal, startTransition, markError, markSaved, scenarioId],
  )

  // ── Hidden rows count (footer) ────────────────────────────────────────────

  const totalHiddenCount = useMemo(() => {
    if (!hideEmpty) return 0
    return sections.reduce((total, section) => {
      const children = categories
        .filter((c) => c.parentId === section.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      const { itemMap } = buildItemRows(section, children, categories, localLines)
      let hidden = 0
      for (const itemLines of itemMap.values()) {
        if (itemLines.every((l) => l.amount === 0)) hidden++
      }
      return total + hidden
    }, 0)
  }, [hideEmpty, sections, categories, localLines])

  const anchor = selection?.anchor ?? null

  return (
    <div ref={gridRootRef} className="relative" tabIndex={-1} onMouseDown={handleGridMouseDown} onKeyDown={handleGridKeyDown}>
      {/* Find bar */}
      {findOpen && (
        <FindBar
          query={findQuery}
          total={matches.length}
          currentIndex={matchCursor}
          onlyMatching={onlyMatching}
          onQueryChange={setFindQuery}
          onNext={handleFindNext}
          onPrev={handleFindPrev}
          onClose={handleFindClose}
          onOnlyMatchingChange={setOnlyMatching}
        />
      )}

      {/* Split cell modal */}
      {splitModal && (
        <SplitCellModal
          sourceLine={splitModal.sourceLine}
          sourceRow={splitModal.sourceRow}
          sourceCol={splitModal.sourceCol}
          periodLabel={splitModal.periodLabel}
          periods={periods}
          onApply={async (plan) => {
            setSplitModal(null)
            await commitSplit(plan)
          }}
          onClose={() => setSplitModal(null)}
        />
      )}

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
        <div className="flex items-center gap-3">
          <SelectionStatsChip aggregates={selectionAggregates} />
          <SaveStatusChip isPending={isPending} status={saveStatus} error={lastSaveError} />
          <StatusPicker
            disabled={!hasAnySelection || isPending}
            onPick={handleSetStatus}
            selectedCount={selectedCellKeys.size}
          />
          <FreezePicker
            freezeCount={freezeCount}
            onChange={setFreezeCount}
            disabled={isNarrowScreen}
          />
          {/* Export button + dropdown menu */}
          <div className="relative">
            <button
              ref={exportButtonRef}
              onClick={() => setExportMenuOpen((prev) => !prev)}
              title="Export forecast data as CSV"
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-zinc-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              Export
            </button>
            {exportMenuOpen && (
              <div
                ref={exportMenuRef}
                className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
              >
                <button
                  disabled={!hasAnySelection}
                  onClick={() => triggerExport('selection')}
                  title={!hasAnySelection ? 'Select one or more cells first' : 'Export selected cells only'}
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                >
                  Export selection
                </button>
                <button
                  onClick={() => triggerExport('view')}
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Export current view
                </button>
                <button
                  onClick={() => triggerExport('all')}
                  className="w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Export entire forecast
                </button>
              </div>
            )}
          </div>
          {/* Shift… button + inline popover */}
          <div className="relative">
            <button
              ref={shiftButtonRef}
              disabled={!hasAnySelection || isPending}
              onClick={() => setShiftPopoverOpen((prev) => !prev)}
              title={
                !hasAnySelection
                  ? 'Select one or more cells first'
                  : `Shift selection by N weeks`
              }
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-zinc-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
            >
              Shift…
            </button>
            {shiftPopoverOpen && (() => {
              // Compute plan preview to show collision warning.
              const previewPlan = planShift(selectedCellKeys, shiftN, flatRows, periods)
              const shiftLabel = shiftN > 0
                ? `Shift forward ${shiftN} week${shiftN === 1 ? '' : 's'}`
                : `Shift backward ${Math.abs(shiftN)} week${Math.abs(shiftN) === 1 ? '' : 's'}`
              const nothingToShift = previewPlan.updates.length === 0 && previewPlan.creates.length === 0

              return (
                <div
                  ref={shiftPopoverRef}
                  className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
                >
                  <p className="mb-2 text-xs font-medium text-zinc-700">Shift selection by N weeks</p>
                  <div className="mb-2 flex items-center gap-2">
                    <label className="text-xs text-zinc-500">Weeks:</label>
                    <input
                      type="number"
                      value={shiftN}
                      min="-104"
                      max="104"
                      step="1"
                      onChange={(e) => setShiftN(Number(e.target.value))}
                      className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="mb-2 text-xs text-zinc-500">{shiftLabel}</p>
                  {previewPlan.collisions > 0 && (
                    <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 ring-1 ring-inset ring-amber-200">
                      {previewPlan.collisions} target cell{previewPlan.collisions === 1 ? '' : 's'} will be overwritten.
                    </p>
                  )}
                  {nothingToShift && (
                    <p className="mb-2 text-xs text-zinc-400">Nothing to shift in the selection.</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={nothingToShift || shiftN === 0}
                      onClick={() => {
                        setShiftPopoverOpen(false)
                        void handleShift(shiftN, { autoConfirm: true })
                      }}
                      className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setShiftPopoverOpen(false)}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
          {/* Copy forward… button + inline popover */}
          <div className="relative">
            <button
              ref={copyFwdButtonRef}
              disabled={!hasAnySelection || isPending}
              onClick={() => setCopyFwdOpen((prev) => !prev)}
              title={
                !hasAnySelection
                  ? 'Select one or more cells first'
                  : `Copy selected cells forward N weeks`
              }
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-zinc-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
            >
              Copy forward…
            </button>
            {copyFwdOpen && (() => {
              // Compute merge preview from N planShift results for live collision count.
              const previewUpdatesById = new Map<string, ShiftAmountUpdate>()
              const previewCreatesByKey = new Map<string, ShiftCreate>()
              let previewCollisions = 0
              let previewSkipped = 0
              const safeN = Math.max(1, Math.min(26, copyFwdN || 1))
              for (let i = 1; i <= safeN; i++) {
                const p = planShift(selectedCellKeys, i, flatRows, periods, { clearSource: false })
                for (const u of p.updates) previewUpdatesById.set(u.id, u)
                for (const c of p.creates) {
                  previewCreatesByKey.set(`${c.entityId}|${c.categoryId}|${c.periodId}`, c)
                }
                previewCollisions += p.collisions
                previewSkipped += p.skipped
              }
              const previewTotal = previewUpdatesById.size + previewCreatesByKey.size
              const nothingToCopy = previewTotal === 0

              return (
                <div
                  ref={copyFwdPopoverRef}
                  className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
                >
                  <p className="mb-2 text-xs font-medium text-zinc-700">Copy selection forward N weeks</p>
                  <div className="mb-2 flex items-center gap-2">
                    <label className="text-xs text-zinc-500">Weeks:</label>
                    <input
                      type="number"
                      value={copyFwdN}
                      min="1"
                      max="26"
                      step="1"
                      onChange={(e) => setCopyFwdN(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
                      className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  {/* Live preview */}
                  <div className="mb-2 min-h-[20px] text-xs">
                    {nothingToCopy ? (
                      <p className="text-zinc-400">Nothing to copy in the selection.</p>
                    ) : (
                      <p className="text-zinc-500">
                        {previewTotal} {previewTotal === 1 ? 'cell' : 'cells'} will be copied across{' '}
                        {safeN} {safeN === 1 ? 'week' : 'weeks'}.
                        {previewCollisions > 0 && (
                          <span className="ml-1 text-amber-600">
                            {previewCollisions} collision{previewCollisions === 1 ? '' : 's'}.
                          </span>
                        )}
                        {previewSkipped > 0 && (
                          <span className="ml-1 text-zinc-400">
                            {previewSkipped} skipped.
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={nothingToCopy}
                      onClick={() => {
                        setCopyFwdOpen(false)
                        void runCopyForward(safeN)
                      }}
                      className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setCopyFwdOpen(false)}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
          {/* Group… button + inline popover (P3.4) */}
          <div className="relative">
            <button
              ref={groupButtonRef}
              disabled={!canGroup || isPending}
              onClick={() => {
                setGroupLabel('')
                setGroupPopoverOpen((prev) => !prev)
              }}
              title={
                !canGroup
                  ? 'Select 2+ item rows from the same sub-category to create a group'
                  : 'Group selected rows'
              }
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm hover:bg-zinc-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
            >
              Group…
            </button>
            {groupPopoverOpen && (
              <div
                ref={groupPopoverRef}
                className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
              >
                <p className="mb-2 text-xs font-medium text-zinc-700">
                  Group {groupCandidates.itemRowIndices.length} rows
                  {groupCandidates.subCategory ? ` in ${groupCandidates.subCategory.name}` : ''}
                </p>
                <div className="mb-2">
                  <label className="mb-1 block text-xs text-zinc-500">Group label</label>
                  <input
                    autoFocus
                    type="text"
                    value={groupLabel}
                    placeholder="e.g. Key Clients"
                    onChange={(e) => setGroupLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateGroup()
                    }}
                    className="w-full rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <p className="mb-2 text-[11px] text-zinc-400">
                  Groups are saved locally. Ctrl+Z does not undo group create/destroy.
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={!groupLabel.trim()}
                    onClick={handleCreateGroup}
                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    Create group
                  </button>
                  <button
                    onClick={() => setGroupPopoverOpen(false)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
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
      </div>

      <div className="overflow-x-auto rounded-b-lg border border-t-0 border-zinc-200">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="sticky left-0 z-20 min-w-[280px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium text-zinc-500">
                Item / Description
              </th>
              {periods.map((p, colIdx) => {
                const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
                return (
                  <th
                    key={p.id}
                    className={cn(
                      'bg-zinc-50 px-2.5 py-2.5 text-right text-xs font-medium text-zinc-500',
                      sticky && 'sticky z-[15]',
                    )}
                    style={sticky ? { left } : undefined}
                  >
                    {weekEndingLabel(new Date(p.weekEnding))}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sections.map((section) => (
              <SectionBlock
                key={section.id}
                section={section}
                categories={categories}
                periods={periods}
                lines={localLines}
                flatRows={flatRows}
                focus={focus}
                range={range}
                anchor={anchor}
                extraSelected={extraSelected}
                onCellSave={handleCellSave}
                onCellClear={handleCellClear}
                onSubtotalSave={handleSubtotalSave}
                onMoveFocus={moveFocus}
                collapsed={collapsed[section.id] ?? false}
                onToggle={toggleSection}
                hideEmpty={hideEmpty}
                overriddenSet={overriddenSet}
                overrideScenarioLabel={overrideScenarioLabel}
                fillPreviewRange={fillPreviewRange}
                onFillStart={handleFillStart}
                onFillDoubleClick={handleFillDoubleClick}
                onCellCreate={handleEmptyCellCreate}
                filterRowSet={filterRowSet}
                highlightCell={highlightCell}
                freezeCount={freezeCount}
                onSplitCellOpen={handleSplitCellOpen}
                groups={groups}
                onToggleGroup={handleToggleGroup}
                onUngroup={handleUngroup}
              />
            ))}

            {/* Net Operating */}
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold">
              <td className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-sm text-zinc-900">Net Operating Cash Flow</td>
              {periods.map((p, colIdx) => {
                const s = summaryMap.get(p.id)
                const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
                return (
                  <td
                    key={p.id}
                    className={cn(
                      'px-2.5 py-2 text-right text-sm tabular-nums',
                      s && s.netOperating < 0 ? 'text-red-600' : 'text-zinc-900',
                      sticky && 'sticky z-[15] bg-zinc-50',
                    )}
                    style={sticky ? { left } : undefined}
                  >
                    {s ? formatCurrency(s.netOperating) : '—'}
                  </td>
                )
              })}
            </tr>

            {/* Closing Balance */}
            <tr className="border-t border-zinc-200 bg-zinc-900 font-bold text-white">
              <td className="sticky left-0 z-10 bg-zinc-900 px-3 py-2.5 text-sm">Closing Balance</td>
              {periods.map((p, colIdx) => {
                const s = summaryMap.get(p.id)
                const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
                return (
                  <td
                    key={p.id}
                    className={cn(
                      'px-2.5 py-2.5 text-right text-sm tabular-nums font-bold',
                      s && s.closingBalance < 0 ? 'text-red-400' : 'text-white',
                      // Explicit bg-zinc-900 so frozen cell blocks scrolling content behind it
                      sticky && 'sticky z-[15] bg-zinc-900',
                    )}
                    style={sticky ? { left } : undefined}
                  >
                    {s ? formatCurrency(s.closingBalance) : '—'}
                  </td>
                )
              })}
            </tr>

            {/* Available Cash */}
            <tr className="border-t border-zinc-200">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-zinc-600">Available Cash (incl. OD)</td>
              {periods.map((p, colIdx) => {
                const s = summaryMap.get(p.id)
                const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
                return (
                  <td
                    key={p.id}
                    className={cn(
                      'px-2.5 py-1.5 text-right text-sm tabular-nums',
                      s && s.availableCash < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600',
                      sticky && 'sticky z-[15] bg-white',
                    )}
                    style={sticky ? { left } : undefined}
                  >
                    {s ? formatCurrency(s.availableCash) : '—'}
                  </td>
                )
              })}
            </tr>

            {/* OD Status — badge pills */}
            <tr className="border-t border-zinc-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-sm text-zinc-500">OD Status</td>
              {periods.map((p, colIdx) => {
                const s = summaryMap.get(p.id)
                const isOverdrawn = s?.isOverdrawn ?? false
                const { sticky, left } = freezeCellStyle(colIdx, freezeCount)
                return (
                  <td
                    key={p.id}
                    className={cn(
                      'px-2.5 py-1.5 text-right tabular-nums',
                      sticky && 'sticky z-[15] bg-white',
                    )}
                    style={sticky ? { left } : undefined}
                  >
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

// ── Save status chip ─────────────────────────────────────────────────────────

function SaveStatusChip({
  isPending,
  status,
  error,
}: {
  isPending: boolean
  status: 'idle' | 'saved' | 'undone' | 'redone' | 'error'
  error: string | null
}) {
  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
        Saving…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Saved
      </span>
    )
  }
  if (status === 'undone') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
        Undone
      </span>
    )
  }
  if (status === 'redone') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-300">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
        Redone
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span
        title={error ?? undefined}
        className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
        Save failed
      </span>
    )
  }
  return null
}

function SelectionStatsChip({ aggregates }: { aggregates: Aggregates | null }) {
  if (!aggregates) return null
  const avgDisplay = Math.round(aggregates.avg)
  return (
    <span
      title={`Selection: ${aggregates.count} cells`}
      className="inline-flex items-center gap-3 rounded-md bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 tabular-nums"
    >
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">Σ</span>
        <span className={aggregates.sum < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(aggregates.sum)}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">⌀</span>
        <span className={avgDisplay < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(avgDisplay)}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">#</span>
        <span className="text-zinc-800">{aggregates.count}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">min</span>
        <span className={aggregates.min < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(aggregates.min)}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">max</span>
        <span className={aggregates.max < 0 ? 'text-rose-600' : 'text-zinc-800'}>
          {formatCurrency(aggregates.max)}
        </span>
      </span>
    </span>
  )
}

const STATUS_PICK_OPTIONS: Array<{ value: LineStatus; label: string }> = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tbc', label: 'TBC' },
  { value: 'awaiting_payment', label: 'Awaiting Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'remittance_received', label: 'Remittance Received' },
  { value: 'speculative', label: 'Speculative' },
  { value: 'awaiting_budget_approval', label: 'Awaiting Budget Approval' },
  { value: 'none', label: 'Clear status' },
]

function humanStatusLabel(status: LineStatus): string {
  return STATUS_PICK_OPTIONS.find((o) => o.value === status)?.label ?? status
}

function StatusPicker({
  disabled,
  onPick,
  selectedCount,
}: {
  disabled: boolean
  onPick: (status: LineStatus) => void
  selectedCount: number
}) {
  return (
    <select
      disabled={disabled}
      value=""
      onChange={(e) => {
        const next = e.target.value as LineStatus | ''
        if (!next) return
        onPick(next)
        e.target.value = ''
      }}
      title={
        disabled
          ? 'Select one or more cells first (drag, Shift+click or Ctrl+click)'
          : `Set status on ${selectedCount} cell${selectedCount === 1 ? '' : 's'}`
      }
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
    >
      <option value="">
        {disabled
          ? 'Set status…'
          : `Set status on ${selectedCount} selected…`}
      </option>
      {STATUS_PICK_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

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

const SectionBlock = memo(function SectionBlock({
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
                        isFocused={isFocusedCell}
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
                      isFocused={isFocusedCell}
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
                      isFocused={isFocusedCell}
                      rowIdx={flatIdx}
                      colIdx={colIdx}
                      inSelectionRange={inAnySelection}
                      isAnchor={isAnchor}
                      isFillPreview={inFillPreview}
                      showFillHandle={showHandle}
                      onFillStart={onFillStart}
                      onFillDoubleClick={onFillDoubleClick}
                      isFindHighlight={isFindHighlight}
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

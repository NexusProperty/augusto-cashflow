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
  type UndoEntry,
  type AmountUpdate,
} from '@/lib/forecast/undo'
import { computeAggregates, type Aggregates } from '@/lib/forecast/aggregates'
import { computeWeekSummaries } from '@/lib/forecast/engine'
import { prorateSubtotal } from '@/lib/forecast/proration'
import { buildFlatRows, buildItemRows, isFocusable, type FlatRow } from '@/lib/forecast/flat-rows'
import {
  collapseTo,
  extendByArrow,
  extendSelection,
  isInRange,
  iterateRange,
  toRange,
  type Selection,
} from '@/lib/forecast/selection'
import { toTSV, parseTSV, parseClipboardNumber } from '@/lib/forecast/clipboard'
import { computeFillHandleRange, isInFillRange, detectPattern, materialisePattern } from '@/lib/forecast/fill-handle'
import { weekEndingLabel, formatCurrency, cn } from '@/lib/utils'
import type { ForecastLine, LineStatus, Period, Category, WeekSummary } from '@/lib/types'
import type { Direction } from './inline-cell-keys'

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
  const localLinesRef = useRef(localLines)
  useEffect(() => { localLinesRef.current = localLines }, [localLines])

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

  const applyLocal = useCallback((updates: Array<{ id: string; amount: number }>) => {
    setLocalLines((prev) => {
      const m = new Map(updates.map((u) => [u.id, u.amount]))
      return prev.map((l) => (m.has(l.id) ? { ...l, amount: m.get(l.id)! } : l))
    })
  }, [])

  const saveUpdates = useCallback(
    (updates: Array<{ id: string; amount: number }>) => {
      if (updates.length === 0) return
      // Capture pre-edit values for potential revert. Done BEFORE we mutate
      // snapshotRef so a concurrent second save sees the latest optimistic
      // state — not the pre-first-save values.
      const old = updates.map((u) => ({
        id: u.id,
        amount: snapshotRef.current.get(u.id) ?? 0,
      }))

      // Promote the optimistic values into the snapshot immediately. If a
      // second save fires before this one's .then resolves, it will capture
      // THIS edit's new values in its own `old`, not the stale pre-edit ones.
      for (const u of updates) snapshotRef.current.set(u.id, u.amount)

      // Optimistic UI
      applyLocal(updates)

      // Push undo entry before the transition (not inside .then) so the user
      // can undo immediately after the optimistic apply. Guard: no push during
      // a replay so undo/redo don't recurse onto the stack.
      if (!isReplayingRef.current) {
        undoStackRef.current.push({
          kind: 'amounts',
          forward: updates as AmountUpdate[],
          inverse: old as AmountUpdate[],
          label: `Edit ${updates.length} cell${updates.length === 1 ? '' : 's'}`,
          scenarioId,
        })
      }

      startTransition(() => {
        updateLineAmounts({ updates })
          .then((res) => {
            if ('error' in res) {
              // Revert local state AND the snapshot — the server never
              // accepted these values, so subsequent saves must see the
              // real pre-edit amounts.
              applyLocal(old)
              for (const o of old) snapshotRef.current.set(o.id, o.amount)
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
            applyLocal(old)
            for (const o of old) snapshotRef.current.set(o.id, o.amount)
            if (process.env.NODE_ENV === 'development') {
              console.warn('updateLineAmounts threw:', err)
            }
            markError(err instanceof Error ? err.message : 'Network error')
          })
      })
    },
    [applyLocal, startTransition, markSaved, markError, scenarioId],
  )

  const handleCellSave = useCallback(
    (lineId: string, amount: number) => {
      saveUpdates([{ id: lineId, amount }])
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

  const toggleSection = useCallback((id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // ── Flat rows for focus navigation ────────────────────────────────────────

  const flatRows = useMemo(
    () => buildFlatRows(sections, categories, localLines, collapsed),
    [sections, categories, localLines, collapsed],
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
    [selection, extraSelected, range, flatRows.length, periods.length, isFocusableRow, buildCopyGrid, applyPasteGrid, replayUndo, replayRedo],
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
        console.warn('Subtotal edit: all lines are pipeline-synced — edit in Pipeline page')
        return
      }
      if (result.changed.length === 0) return
      saveUpdates(result.changed)
    },
    [localLines, saveUpdates, handleEmptySubtotalCreate],
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
    <div ref={gridRootRef} onMouseDown={handleGridMouseDown} onKeyDown={handleGridKeyDown}>
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
  onCellSave: (lineId: string, amount: number) => void
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

  const itemRows = useMemo(
    () =>
      Array.from(itemMap.entries()).map(([key, itemLines]) => {
        const firstLine = itemLines[0]!
        const label = firstLine.counterparty ?? firstLine.notes ?? 'Line item'
        const lineMap = new Map(itemLines.map((l) => [l.periodId, l]))
        const isPipeline = firstLine.source === 'pipeline'
        return { key, label, lineMap, isPipeline, line: firstLine }
      }),
    [itemMap],
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
        {sectionTotals.map((total, i) => (
          <td
            key={periods[i]!.id}
            className={cn('px-2.5 py-2 text-right text-xs font-semibold tabular-nums', style.totalColor)}
          >
            {total !== 0 ? formatCurrency(total) : '—'}
          </td>
        ))}
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
                      />
                    )
                  }
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
                    />
                  )
                })}
              </tr>
            )
          })}

          {itemRows.map(({ key, label, lineMap, isPipeline, line }) => {
            if (hideEmpty && emptyKeys.has(key)) return null
            const isOverridden =
              overriddenSet && Array.from(lineMap.values()).some((l) => overriddenSet.has(l.id))
            const overrideTitle = isOverridden
              ? `Overridden in ${overrideScenarioLabel ?? 'active scenario'}`
              : undefined

            const flatIdx = flatIndexByKey.get(`item::${key}`) ?? -1

            if (isPipeline) {
              // Read-only row — delegate to ForecastRow
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
                  readOnlyCells
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
                  const cellLine = lineMap.get(p.id)
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
                  return (
                    <InlineCell
                      key={p.id}
                      value={amount}
                      isNegative={amount < 0}
                      isComputed={false}
                      lineStatus={cellLine?.lineStatus}
                      onSave={(newAmount) => {
                        if (cellLine) {
                          onCellSave(cellLine.id, newAmount)
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

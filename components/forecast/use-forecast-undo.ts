'use client'

import { useRef, useCallback } from 'react'
import {
  UndoStack,
  entryReplayable,
  groupByPrevStatus,
  type AtomicUndoEntry,
  type AmountUpdate,
} from '@/lib/forecast/undo'
import type { ForecastLine, LineStatus } from '@/lib/types'

// ── SaveStatus type (subset used by mark* helpers) ───────────────────────────
export type SaveStatus = 'idle' | 'saved' | 'undone' | 'redone' | 'error'

// ── BulkAddRow type (mirrors bulkAddForecastLines input shape) ───────────────
export interface BulkAddRow {
  entityId: string
  categoryId: string
  periodId: string
  amount: number
  confidence?: number
  counterparty?: string | null
  notes?: string | null
  lineStatus?: string
  source?: string
}

// ── Hook deps ─────────────────────────────────────────────────────────────────

export interface UseForecastUndoDeps {
  scenarioId: string | null | undefined
  setLocalLines: React.Dispatch<React.SetStateAction<ForecastLine[]>>
  localLinesRef: React.MutableRefObject<ForecastLine[]>
  markError: (msg: string) => void
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>
  saveStatusTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  // Server-action replayers injected by the grid — keeps this hook free of
  // Next.js server-action imports and makes it testable in isolation.
  /** Called for `amounts` undo/redo. Wraps optimistic update + server save. */
  onReplayAmounts: (updates: AmountUpdate[]) => void
  /** Called for `status` undo/redo. Returns ok or error. */
  onReplayStatus: (
    ids: string[],
    status: LineStatus,
  ) => Promise<{ ok: true } | { error: string }>
  /** Called for `created` undo (deletes the line). Returns ok or error. */
  onReplayDelete: (
    lineId: string,
  ) => Promise<{ ok: true } | { error: string }>
  /** Called for `deleted` undo/redo (re-creates lines). Returns ok+data or error. */
  onReplayBulkAdd: (
    rows: BulkAddRow[],
  ) => Promise<{ ok: true; data: ForecastLine[] } | { error: string }>
}

// ── Hook return ───────────────────────────────────────────────────────────────

export interface UseForecastUndoReturn {
  undoStackRef: React.MutableRefObject<UndoStack>
  isReplayingRef: React.MutableRefObject<boolean>
  replayUndo: () => Promise<void>
  replayRedo: () => Promise<void>
  markUndone: () => void
  markRedone: () => void
}

// ── useForecastUndo ───────────────────────────────────────────────────────────

export function useForecastUndo(deps: UseForecastUndoDeps): UseForecastUndoReturn {
  const {
    scenarioId,
    setLocalLines,
    localLinesRef,
    markError,
    setSaveStatus,
    saveStatusTimeoutRef,
    onReplayAmounts,
    onReplayStatus,
    onReplayDelete,
    onReplayBulkAdd,
  } = deps

  // ── Stack + guard refs ────────────────────────────────────────────────────
  const undoStackRef = useRef(new UndoStack())
  const isReplayingRef = useRef(false)

  // ── Save-status helpers ───────────────────────────────────────────────────
  // markUndone / markRedone mirror the markSaved / markError pattern owned by
  // the grid. They share setSaveStatus + saveStatusTimeoutRef which the grid
  // keeps (those state bits are used by non-undo flows too).

  const markUndone = useCallback(() => {
    setSaveStatus('undone')
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current)
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }, [setSaveStatus, saveStatusTimeoutRef])

  const markRedone = useCallback(() => {
    setSaveStatus('redone')
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current)
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }, [setSaveStatus, saveStatusTimeoutRef])

  // ── replayUndo ────────────────────────────────────────────────────────────

  const replayUndo = useCallback(async () => {
    const entry = undoStackRef.current.undo()
    if (!entry) return

    if (!entryReplayable(entry, scenarioId ?? null)) {
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
        onReplayAmounts(entry.inverse)
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
          const res = await onReplayStatus(batch.ids, batch.status)
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
        // push a `deleted`-kind entry onto the redo stack. That way `replayRedo`
        // hits the existing `deleted` branch which calls onReplayBulkAdd.
        const lineSnapshot = localLinesRef.current.find((l) => l.id === entry.realId) ?? null
        const res = await onReplayDelete(entry.realId!)
        if (res && 'error' in res) {
          markError(res.error ?? 'Delete failed')
          return
        }
        setLocalLines((cur) => cur.filter((l) => l.id !== entry.realId))
        // Push a synthetic `deleted` entry (not the original `created`) so redo
        // can re-create the line via the existing onReplayBulkAdd path.
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
        const result = await onReplayBulkAdd(entry.lines)
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
        // onReplayBulkAdd. This mirrors the standalone `created` case above.
        const createdSnapshots = new Map<string, AtomicUndoEntry & { kind: 'deleted' }>()

        for (const sub of entry.entries) {
          if (sub.kind === 'amounts') {
            onReplayAmounts(sub.inverse)
          } else if (sub.kind === 'created') {
            if (sub.realId === null) {
              markError('Wait — save in flight')
              undoStackRef.current.pushUndoPreserveRedo(entry)
              return
            }
            const lineSnapshot = localLinesRef.current.find((l) => l.id === sub.realId) ?? null
            const res = await onReplayDelete(sub.realId)
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
            const result = await onReplayBulkAdd(sub.lines)
            if ('error' in result) {
              // Mid-loop failure: push original compound back for retry (same
              // rationale as the onReplayDelete failure case above).
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
  }, [scenarioId, onReplayAmounts, onReplayStatus, onReplayDelete, onReplayBulkAdd, setLocalLines, localLinesRef, markError, markUndone])

  // ── replayRedo ────────────────────────────────────────────────────────────

  const replayRedo = useCallback(async () => {
    const entry = undoStackRef.current.redo()
    if (!entry) return

    if (!entryReplayable(entry, scenarioId ?? null)) {
      markError('Skipped: scenario changed')
      return
    }

    isReplayingRef.current = true
    try {
      if (entry.kind === 'amounts') {
        onReplayAmounts(entry.forward)
      } else if (entry.kind === 'status') {
        // Apply locally first (optimistic), then confirm with server.
        // On server error, roll back the optimistic local flip (undo the redo).
        const nextStatus = entry.next
        const idSet = new Set(entry.ids)
        const prevMap = entry.prev
        setLocalLines((cur) =>
          cur.map((l) => (idSet.has(l.id) ? { ...l, lineStatus: nextStatus } : l)),
        )
        const res = await onReplayStatus(entry.ids, entry.next)
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
        const results = await Promise.all(entry.lines.map((l) => onReplayDelete(l.id)))
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
        // When a `deleted` sub-entry is re-created via onReplayBulkAdd,
        // we convert it back to a `created` sub-entry (using the new realId
        // returned by the server) on the compound that goes back onto the undo
        // stack. This keeps undo→redo→undo→redo cycles idempotent.
        const deletedToCreated = new Map<string, AtomicUndoEntry & { kind: 'created' }>()

        for (const sub of entry.entries) {
          if (sub.kind === 'amounts') {
            onReplayAmounts(sub.forward)
          } else if (sub.kind === 'created') {
            // `created` sub-entries on the redo stack are no-ops — they were
            // converted to `deleted` during undo (Option A), so re-create is
            // handled by the `deleted` sub-entry. Legacy entries silently pass.
          } else if (sub.kind === 'deleted') {
            const result = await onReplayBulkAdd(sub.lines)
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
  }, [scenarioId, onReplayAmounts, onReplayStatus, onReplayDelete, onReplayBulkAdd, setLocalLines, markError, markRedone])

  return {
    undoStackRef,
    isReplayingRef,
    replayUndo,
    replayRedo,
    markUndone,
    markRedone,
  }
}

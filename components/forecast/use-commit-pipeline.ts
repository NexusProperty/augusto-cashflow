'use client'

/**
 * useCommitPipeline — shared optimistic-commit pipeline for bulk forecast operations.
 *
 * Extracted from ForecastGrid's four near-identical ~80-line commit blocks:
 *   handleShift, handleDuplicateRight, commitSplit, runCopyForward.
 *
 * The hook owns:
 *   - Snapshot old amounts → optimistic apply → add temp lines
 *   - startTransition → Promise.all([updateLineAmounts, bulkAddForecastLines])
 *   - Full-failure revert (amounts + temp lines removed)
 *   - Partial-failure path (creates fail, amounts already persisted → partial compound)
 *   - Temp-id swap keyed by (entityId, categoryId, periodId)
 *   - Full-success compound undo push
 *   - markSaved
 *
 * The hook does NOT own:
 *   - Planning (caller builds CommitPlan using its planner)
 *   - Per-caller UX (popovers, collision prompts, etc.)
 *   - Keyboard bindings or modal state
 */

import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ForecastLine } from '@/lib/types'
import type { AtomicUndoEntry, AmountUpdate } from '@/lib/forecast/undo'
import type { UndoStack } from '@/lib/forecast/undo'
import type { BulkAddRow } from './use-forecast-undo'

// ── Public types ──────────────────────────────────────────────────────────────

/** Minimal shape for an update in a commit plan. Compatible with ShiftAmountUpdate and SplitCellPlan.updates items. */
export interface PlanUpdate {
  id: string
  amount: number
}

/** Minimal shape for a create in a commit plan. Compatible with ShiftCreate and SplitCellPlan.creates items. */
export interface PlanCreate {
  entityId: string
  categoryId: string
  periodId: string
  amount: number
  counterparty: string | null
  notes: string | null
  lineStatus: ForecastLine['lineStatus']
  tempId: string
}

/** The normalised plan passed to commitPlan(). Planners may return superset shapes; cast at call site if needed. */
export interface CommitPlan {
  updates: PlanUpdate[]
  creates: PlanCreate[]
}

/** Labels controlling the compound undo entries produced on success and partial-failure. */
export interface CommitPipelineOptions {
  /** Label for the compound undo entry on full success. */
  undoLabel: string
  /** Label for the partial-amounts-only compound pushed when creates fail but updates succeed. */
  partialLabel: string
}

// ── Hook deps ─────────────────────────────────────────────────────────────────

export interface UseCommitPipelineDeps {
  scenarioId: string | null | undefined
  setLocalLines: Dispatch<SetStateAction<ForecastLine[]>>
  snapshotRef: MutableRefObject<Map<string, number>>
  applyLocal: (updates: Array<{ id: string; amount: number; formula?: string | null }>) => void
  startTransition: (scope: () => void) => void
  markSaved: () => void
  markError: (msg: string) => void
  isReplayingRef: MutableRefObject<boolean>
  undoStackRef: MutableRefObject<UndoStack>
  // Server-action deps injected so the hook stays test-friendly and free of
  // Next.js server-action imports.
  onUpdateAmounts: (payload: { updates: AmountUpdate[] }) => Promise<{ ok: true; count?: number } | { error: string }>
  onBulkAdd: (rows: BulkAddRow[]) => Promise<{ ok: true; data: ForecastLine[] } | { error: string }>
}

// ── useCommitPipeline ─────────────────────────────────────────────────────────

/**
 * Returns an async `commitPlan(plan, options)` function. Each call:
 *  1. Snapshots old amounts from snapshotRef.
 *  2. Optimistically applies updates and inserts temp lines.
 *  3. Runs server calls inside startTransition.
 *  4. On update failure: reverts all optimistic state, calls markError.
 *  5. On create failure only: removes temp lines, pushes partial compound, calls markError.
 *  6. On full success: swaps temp ids for real ids, pushes full compound, calls markSaved.
 */
export function useCommitPipeline(deps: UseCommitPipelineDeps): (plan: CommitPlan, options: CommitPipelineOptions) => Promise<void> {
  const {
    scenarioId,
    setLocalLines,
    snapshotRef,
    applyLocal,
    startTransition,
    markSaved,
    markError,
    isReplayingRef,
    undoStackRef,
    onUpdateAmounts,
    onBulkAdd,
  } = deps

  const commitPlan = useCallback(
    async (plan: CommitPlan, options: CommitPipelineOptions): Promise<void> => {
      const { undoLabel, partialLabel } = options
      const { updates, creates } = plan

      if (updates.length === 0 && creates.length === 0) return

      // ── Optimistic local update ─────────────────────────────────────────────

      // 1. Snapshot old amounts and apply updates immediately.
      const oldAmounts: AmountUpdate[] = updates.map((u) => ({
        id: u.id,
        amount: snapshotRef.current.get(u.id) ?? 0,
      }))
      for (const u of updates) snapshotRef.current.set(u.id, u.amount)
      if (updates.length > 0) applyLocal(updates)

      // 2. Insert optimistic temp lines for creates.
      const tempLines: ForecastLine[] = creates.map((c) => ({
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

      // ── Server calls ────────────────────────────────────────────────────────

      startTransition(() => {
        const doCommit = async () => {
          const [updateResult, createResult] = await Promise.all([
            updates.length > 0
              ? onUpdateAmounts({ updates })
              : Promise.resolve({ ok: true as const, count: 0 }),
            creates.length > 0
              ? onBulkAdd(
                  creates.map((c) => ({
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

          // ── Full failure (updates failed) ─────────────────────────────────
          if ('error' in updateResult) {
            // Revert optimistic amount updates.
            applyLocal(oldAmounts)
            for (const o of oldAmounts) snapshotRef.current.set(o.id, o.amount)
            // Revert optimistic temp lines.
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            markError(updateResult.error ?? 'Save failed')
            return
          }

          // ── Partial failure (creates failed, amounts persisted) ────────────
          if ('error' in createResult) {
            // Remove temp lines — creates never landed.
            if (tempLines.length > 0) {
              const tempIds = new Set(tempLines.map((l) => l.id))
              setLocalLines((prev) => prev.filter((l) => !tempIds.has(l.id)))
            }
            // Push partial compound so the user can Ctrl+Z the amount updates
            // that did succeed.
            if (!isReplayingRef.current && updates.length > 0) {
              const partialAmountsSub: AtomicUndoEntry = {
                kind: 'amounts',
                forward: updates,
                inverse: oldAmounts,
                label: `${partialLabel} amounts (partial)`,
                scenarioId: scenarioId ?? null,
              }
              undoStackRef.current.push({
                kind: 'compound',
                entries: [partialAmountsSub],
                label: partialLabel,
                scenarioId: scenarioId ?? null,
              })
            }
            markError(createResult.error ?? 'Create failed')
            return
          }

          // ── Full success ──────────────────────────────────────────────────
          const createdLines = 'data' in createResult ? createResult.data : []

          // Build stable lookup by (entityId, categoryId, periodId) so server
          // re-ordering never assigns a realId to the wrong temp entry.
          const responseByKey = new Map<string, ForecastLine>()
          for (const row of createdLines) {
            responseByKey.set(`${row.entityId}|${row.categoryId}|${row.periodId}`, row)
          }

          // Swap temp ids for real ids.
          if (createdLines.length > 0) {
            const realByTempId = new Map<string, ForecastLine>()
            for (const c of creates) {
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
              forward: updates,
              inverse: oldAmounts,
              label: `${undoLabel} amounts`,
              scenarioId: scenarioId ?? null,
            }

            const createdSubs: AtomicUndoEntry[] = creates
              .map((c) => {
                const key = `${c.entityId}|${c.categoryId}|${c.periodId}`
                const real = responseByKey.get(key)
                if (!real) return null
                return {
                  kind: 'created' as const,
                  tempId: c.tempId,
                  realId: real.id,
                  label: `(inside ${undoLabel})`,
                  scenarioId: scenarioId ?? null,
                }
              })
              .filter((s): s is NonNullable<typeof s> => s !== null)

            undoStackRef.current.push({
              kind: 'compound',
              entries: [amountsSub, ...createdSubs],
              label: undoLabel,
              scenarioId: scenarioId ?? null,
            })
          }

          markSaved()
        }

        void doCommit()
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarioId, applyLocal, setLocalLines, snapshotRef, startTransition, markSaved, markError, isReplayingRef, undoStackRef, onUpdateAmounts, onBulkAdd],
  )

  return commitPlan
}

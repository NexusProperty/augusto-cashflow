/**
 * Pure undo/redo ring buffer for the forecast grid.
 * No React / server-side imports — fully unit-testable.
 */

import type { ForecastLine, LineStatus } from '@/lib/types'

export interface AmountUpdate {
  id: string
  amount: number
  /** Optional formula text. Undefined = leave formula unchanged; null = clear it. */
  formula?: string | null
}

/** Atomic (non-compound) undo entry — the primitives that compound entries wrap. */
export type AtomicUndoEntry =
  | {
      kind: 'amounts'
      forward: AmountUpdate[]
      inverse: AmountUpdate[]
      label: string
      scenarioId: string | null
    }
  | {
      kind: 'status'
      ids: string[]
      prev: Map<string, LineStatus>
      next: LineStatus
      label: string
      scenarioId: string | null
    }
  | {
      kind: 'created'
      tempId: string
      realId: string | null
      label: string
      scenarioId: string | null
    }
  | {
      kind: 'deleted'
      lines: ForecastLine[]
      label: string
      scenarioId: string | null
    }

export type UndoEntry =
  | AtomicUndoEntry
  | {
      /**
       * A compound entry that groups 1+ atomic sub-entries into a single
       * logical undo/redo unit (e.g. a shift-by-N-weeks operation).
       *
       * Rules:
       *  - Nested `compound` entries inside `entries` are FORBIDDEN.
       *    Callers must ensure all sub-entries are atomic kinds.
       *  - Each sub-entry's `scenarioId` must equal this compound's `scenarioId`
       *    at construction time.
       *  - On undo/redo replay, the grid walks `entries` in order for both
       *    undo and redo, delegating to each sub-entry's existing replay path.
       *    The `isReplayingRef` guard prevents sub-entries from pushing new
       *    stack entries during replay.
       */
      kind: 'compound'
      entries: AtomicUndoEntry[]
      label: string
      scenarioId: string | null
    }

const RING_DEPTH = 100

export class UndoStack {
  private undoRing: UndoEntry[] = []
  private redoStack: UndoEntry[] = []

  get size(): number {
    return this.undoRing.length
  }

  peek(): UndoEntry | null {
    return this.undoRing[this.undoRing.length - 1] ?? null
  }

  push(entry: UndoEntry): void {
    if (this.undoRing.length >= RING_DEPTH) {
      this.undoRing.shift()
    }
    this.undoRing.push(entry)
    this.redoStack = []
  }

  private pushUndoInternal(entry: UndoEntry): void {
    if (this.undoRing.length >= RING_DEPTH) this.undoRing.shift()
    this.undoRing.push(entry)
  }

  /**
   * Push an entry back onto the undo ring WITHOUT clearing the redo stack.
   * Used after a redo replay so subsequent redo steps remain available.
   *
   * Intentionally identical implementation to pushUndoPreserveRedo — the
   * different names preserve call-site intent: this variant is for after-redo
   * replay, the other is for failure-retry. Do NOT collapse to one method
   * without updating all call sites.
   */
  pushUndoAfterRedo(entry: UndoEntry): void { this.pushUndoInternal(entry) }

  /**
   * Re-push an entry onto the undo ring WITHOUT clearing the redo stack.
   * Used when an undo attempt fails transiently (e.g. `created` entry whose
   * server round-trip hasn't resolved yet, or mid-compound-undo server error)
   * so the user can retry once the server recovers. Unlike `push`, this does
   * NOT wipe pending redo entries.
   *
   * Intentionally identical implementation to pushUndoAfterRedo — the
   * different names preserve call-site intent: this variant is for failure
   * retry, the other is for after-redo replay.
   */
  pushUndoPreserveRedo(entry: UndoEntry): void { this.pushUndoInternal(entry) }

  /**
   * Patch the `realId` on the most-recent `created` entry that matches
   * `tempId`. Called after the server responds with the real DB id.
   * Also searches inside `compound` sub-entries.
   */
  patchRealId(tempId: string, realId: string): void {
    for (let i = this.undoRing.length - 1; i >= 0; i--) {
      const e = this.undoRing[i]!
      if (e.kind === 'created' && e.tempId === tempId) {
        this.undoRing[i] = { ...e, realId }
        return
      }
      if (e.kind === 'compound') {
        for (let j = e.entries.length - 1; j >= 0; j--) {
          const sub = e.entries[j]!
          if (sub.kind === 'created' && sub.tempId === tempId) {
            const newEntries = [...e.entries]
            newEntries[j] = { ...sub, realId }
            this.undoRing[i] = { ...e, entries: newEntries }
            return
          }
        }
      }
    }
  }

  /**
   * Remove a `created` entry by tempId. Called when the server create fails
   * so we don't leave a dangling entry on the stack.
   * Also searches inside `compound` sub-entries.
   */
  removeTempEntry(tempId: string): void {
    for (let i = this.undoRing.length - 1; i >= 0; i--) {
      const e = this.undoRing[i]!
      if (e.kind === 'created' && e.tempId === tempId) {
        this.undoRing.splice(i, 1)
        return
      }
      if (e.kind === 'compound') {
        const subIdx = e.entries.findLastIndex(
          (sub) => sub.kind === 'created' && sub.tempId === tempId,
        )
        if (subIdx !== -1) {
          const newEntries = [...e.entries]
          newEntries.splice(subIdx, 1)
          this.undoRing[i] = { ...e, entries: newEntries }
          return
        }
      }
    }
  }

  /**
   * Pop the top undo entry. Returns `null` if the stack is empty.
   * The caller is responsible for executing the inverse operation and deciding
   * whether to push onto redo (e.g. skip if scenario mismatch).
   */
  undo(): UndoEntry | null {
    const entry = this.undoRing.pop()
    return entry ?? null
  }

  /**
   * Push an entry onto the redo stack (called by the grid after a successful
   * undo replay, so the action can be re-done).
   */
  pushRedo(entry: UndoEntry): void {
    this.redoStack.push(entry)
  }

  /**
   * Pop the top redo entry. Returns `null` if the redo stack is empty.
   */
  redo(): UndoEntry | null {
    const entry = this.redoStack.pop()
    return entry ?? null
  }

  get redoSize(): number {
    return this.redoStack.length
  }
}

/**
 * Returns `true` when `entry` can be replayed in the grid's current scenario
 * context. A mismatch means the entry was recorded in a different scenario
 * and replaying it would corrupt data.
 */
export function entryReplayable(
  entry: UndoEntry,
  currentScenarioId: string | null,
): boolean {
  return entry.scenarioId === currentScenarioId
}

/**
 * Group a `status` undo entry's `prev` map into batches by distinct status
 * value. Each batch is one `bulkUpdateLineStatus` call.
 */
export function groupByPrevStatus(
  prev: Map<string, LineStatus>,
): Array<{ status: LineStatus; ids: string[] }> {
  const groups = new Map<LineStatus, string[]>()
  for (const [id, status] of prev) {
    const existing = groups.get(status)
    if (existing) {
      existing.push(id)
    } else {
      groups.set(status, [id])
    }
  }
  return Array.from(groups.entries()).map(([status, ids]) => ({ status, ids }))
}

import { describe, expect, it } from 'vitest'
import { UndoStack, entryReplayable, groupByPrevStatus } from '@/lib/forecast/undo'
import type { UndoEntry } from '@/lib/forecast/undo'
import type { LineStatus } from '@/lib/types'

function makeAmounts(n: number, scenarioId: string | null = null): UndoEntry {
  return {
    kind: 'amounts',
    forward: [{ id: `line-${n}`, amount: n * 10 }],
    inverse: [{ id: `line-${n}`, amount: n * 5 }],
    label: `Edit 1 cell`,
    scenarioId,
  }
}

function makeStatus(
  ids: string[],
  prev: Map<string, LineStatus>,
  next: LineStatus,
  scenarioId: string | null = null,
): UndoEntry {
  return {
    kind: 'status',
    ids,
    prev,
    next,
    label: `Status → Confirmed (${ids.length} cell${ids.length === 1 ? '' : 's'})`,
    scenarioId,
  }
}

function makeCreated(tempId: string, scenarioId: string | null = null): UndoEntry {
  return {
    kind: 'created',
    tempId,
    realId: null,
    label: 'Create cell',
    scenarioId,
  }
}

// ── UndoStack ────────────────────────────────────────────────────────────────

describe('UndoStack — push / undo / redo', () => {
  it('push/undo cycle returns the top entry and decrements size', () => {
    const stack = new UndoStack()
    const e1 = makeAmounts(1)
    const e2 = makeAmounts(2)
    stack.push(e1)
    stack.push(e2)
    expect(stack.size).toBe(2)

    const popped = stack.undo()
    expect(popped).toBe(e2)
    expect(stack.size).toBe(1)
  })

  it('undo then redo cycle restores the entry', () => {
    const stack = new UndoStack()
    const e = makeAmounts(1)
    stack.push(e)

    const popped = stack.undo()
    expect(popped).not.toBeNull()
    stack.pushRedo(popped!)

    expect(stack.redoSize).toBe(1)
    const redone = stack.redo()
    expect(redone).toBe(e)
    expect(stack.redoSize).toBe(0)
  })

  it('redo stack is cleared when a new push happens after an undo', () => {
    const stack = new UndoStack()
    stack.push(makeAmounts(1))
    stack.undo()
    stack.pushRedo(makeAmounts(1)) // simulate redo pending

    expect(stack.redoSize).toBe(1)

    // new user action clears redo via push
    stack.push(makeAmounts(2))
    expect(stack.redoSize).toBe(0)
  })

  it('ring eviction: pushing 101 entries caps size at 100, oldest evicted', () => {
    const stack = new UndoStack()
    for (let i = 0; i < 101; i++) {
      stack.push(makeAmounts(i))
    }
    expect(stack.size).toBe(100)

    // The oldest (i=0, amount=0) should be gone; top should be i=100 (amount=1000)
    const top = stack.peek()
    expect(top?.kind).toBe('amounts')
    if (top?.kind === 'amounts') {
      expect(top.forward[0]?.amount).toBe(1000)
    }
  })

  it('empty-stack undo returns null', () => {
    const stack = new UndoStack()
    expect(stack.undo()).toBeNull()
  })

  it('empty-stack redo returns null', () => {
    const stack = new UndoStack()
    expect(stack.redo()).toBeNull()
  })
})

describe('UndoStack — pushUndoPreserveRedo', () => {
  it('re-pushes an entry onto undo without clearing the redo stack', () => {
    const stack = new UndoStack()
    const a = makeAmounts(1)
    const redoEntry = makeAmounts(99)

    stack.push(a)
    stack.undo()
    // Simulate a pending redo entry
    stack.pushRedo(redoEntry)
    expect(stack.redoSize).toBe(1)

    // Re-push A via pushUndoPreserveRedo (e.g. created-entry retry scenario)
    stack.pushUndoPreserveRedo(a)

    // Undo ring has A back
    expect(stack.size).toBe(1)
    expect(stack.peek()).toBe(a)
    // Redo stack is untouched
    expect(stack.redoSize).toBe(1)
  })

  it('entry is at top of undo after re-push (peek confirms retryable)', () => {
    const stack = new UndoStack()
    const created: UndoEntry = {
      kind: 'created',
      tempId: 'temp-1',
      realId: null,
      label: 'Create cell',
      scenarioId: null,
    }
    stack.push(created)
    const popped = stack.undo()
    expect(popped).toBe(created)
    expect(stack.size).toBe(0)

    // Simulate the transient-failure re-push
    stack.pushUndoPreserveRedo(created)
    expect(stack.peek()).toBe(created)
  })

  it('redo stack still contains A after pushUndoPreserveRedo — round-trip assertion', () => {
    // Regression guard: push A → undo A (A on redo) → re-push A via
    // pushUndoPreserveRedo → redo stack still has A.
    const stack = new UndoStack()
    const a = makeAmounts(1)
    stack.push(a)
    const undone = stack.undo()
    stack.pushRedo(undone!) // A is now on redo

    stack.pushUndoPreserveRedo(a)

    expect(stack.redoSize).toBe(1)
    const redone = stack.redo()
    expect(redone).toBe(undone)
  })
})

describe('UndoStack — peek', () => {
  it('peek returns top-of-undo without mutating the stack', () => {
    const stack = new UndoStack()
    const e1 = makeAmounts(1)
    const e2 = makeAmounts(2)
    stack.push(e1)
    stack.push(e2)

    const peeked = stack.peek()
    expect(peeked).toBe(e2)
    expect(stack.size).toBe(2) // unchanged
  })

  it('peek on an empty stack returns null', () => {
    expect(new UndoStack().peek()).toBeNull()
  })
})

describe('UndoStack — patchRealId / removeTempEntry', () => {
  it('patchRealId updates realId on the matching created entry', () => {
    const stack = new UndoStack()
    stack.push(makeCreated('temp-abc'))
    stack.patchRealId('temp-abc', 'real-uuid-123')

    const top = stack.peek()
    expect(top?.kind).toBe('created')
    if (top?.kind === 'created') {
      expect(top.realId).toBe('real-uuid-123')
    }
  })

  it('removeTempEntry removes the matching created entry', () => {
    const stack = new UndoStack()
    stack.push(makeCreated('temp-abc'))
    expect(stack.size).toBe(1)

    stack.removeTempEntry('temp-abc')
    expect(stack.size).toBe(0)
  })

  it('removeTempEntry is a no-op for unknown tempId', () => {
    const stack = new UndoStack()
    stack.push(makeCreated('temp-abc'))
    stack.removeTempEntry('temp-xyz')
    expect(stack.size).toBe(1)
  })
})

// ── Inverse composition — amounts ────────────────────────────────────────────

describe('amounts inverse composition', () => {
  it('the inverse field holds the pre-edit values that restore original state', () => {
    const old = [{ id: 'line-1', amount: 500 }]
    const forward = [{ id: 'line-1', amount: 750 }]
    const entry: UndoEntry = {
      kind: 'amounts',
      forward,
      inverse: old,
      label: 'Edit 1 cell',
      scenarioId: null,
    }
    // Undoing means applying `inverse` to go back to the pre-edit value
    expect(entry.kind === 'amounts' && entry.inverse[0]?.amount).toBe(500)
    expect(entry.kind === 'amounts' && entry.forward[0]?.amount).toBe(750)
  })
})

// ── Inverse composition — status ─────────────────────────────────────────────

describe('groupByPrevStatus', () => {
  it('groups ids by their previous status value', () => {
    const prev = new Map<string, LineStatus>([
      ['line-1', 'confirmed'],
      ['line-2', 'tbc'],
      ['line-3', 'confirmed'],
      ['line-4', 'paid'],
    ])
    const groups = groupByPrevStatus(prev)

    const confirmed = groups.find((g) => g.status === 'confirmed')
    const tbc = groups.find((g) => g.status === 'tbc')
    const paid = groups.find((g) => g.status === 'paid')

    expect(confirmed?.ids).toHaveLength(2)
    expect(confirmed?.ids).toContain('line-1')
    expect(confirmed?.ids).toContain('line-3')
    expect(tbc?.ids).toHaveLength(1)
    expect(paid?.ids).toHaveLength(1)
  })

  it('returns one group when all ids had the same prev status', () => {
    const prev = new Map<string, LineStatus>([
      ['a', 'tbc'],
      ['b', 'tbc'],
    ])
    const groups = groupByPrevStatus(prev)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.status).toBe('tbc')
    expect(groups[0]?.ids).toHaveLength(2)
  })

  it('returns empty array for an empty map', () => {
    expect(groupByPrevStatus(new Map())).toHaveLength(0)
  })
})

// ── entryReplayable ──────────────────────────────────────────────────────────

describe('entryReplayable — scenario mismatch predicate', () => {
  it('returns true when scenarioIds match (both null)', () => {
    const entry = makeAmounts(1, null)
    expect(entryReplayable(entry, null)).toBe(true)
  })

  it('returns true when scenarioIds match (both the same uuid)', () => {
    const id = 'scenario-uuid-1'
    const entry = makeAmounts(1, id)
    expect(entryReplayable(entry, id)).toBe(true)
  })

  it('returns false when entry has null but current has a scenario', () => {
    const entry = makeAmounts(1, null)
    expect(entryReplayable(entry, 'scenario-uuid-1')).toBe(false)
  })

  it('returns false when entry has a scenario but current is null (switched to base)', () => {
    const entry = makeAmounts(1, 'scenario-uuid-1')
    expect(entryReplayable(entry, null)).toBe(false)
  })

  it('returns false when entry has a different scenario uuid', () => {
    const entry = makeAmounts(1, 'scenario-uuid-1')
    expect(entryReplayable(entry, 'scenario-uuid-2')).toBe(false)
  })

  it('works for status and created entry kinds too', () => {
    const statusEntry = makeStatus(
      ['l1'],
      new Map<string, LineStatus>([['l1', 'tbc']]),
      'confirmed',
      'scenario-A',
    )
    expect(entryReplayable(statusEntry, 'scenario-A')).toBe(true)
    expect(entryReplayable(statusEntry, null)).toBe(false)

    const createdEntry = makeCreated('temp-1', null)
    expect(entryReplayable(createdEntry, null)).toBe(true)
    expect(entryReplayable(createdEntry, 'scenario-A')).toBe(false)
  })
})

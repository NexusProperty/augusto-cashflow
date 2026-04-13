import { describe, expect, it } from 'vitest'
import { planShift } from '@/lib/forecast/shift-by-weeks'
import type { FlatRow } from '@/lib/forecast/flat-rows'
import type { ForecastLine } from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePeriod(idx: number) {
  return { id: `period-${idx}` }
}

function makeLine(overrides: Partial<ForecastLine> = {}): ForecastLine {
  return {
    id: `line-${Math.random().toString(36).slice(2)}`,
    entityId: 'entity-1',
    categoryId: 'cat-1',
    periodId: 'period-0',
    amount: 100,
    confidence: 100,
    source: 'manual',
    counterparty: 'Acme Corp',
    notes: 'quarterly',
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'confirmed',
    ...overrides,
  }
}

/** Build an 'item' FlatRow with a map of periodId → ForecastLine. */
function makeItemRow(lineMap: Map<string, ForecastLine>): FlatRow {
  return {
    kind: 'item',
    sectionId: 'section-1',
    itemKey: 'cat-1::Acme Corp',
    lineIds: Array.from(lineMap.values()).map((l) => l.id),
    lineByPeriod: lineMap,
    isPipeline: false,
  }
}

/** Build a sectionHeader FlatRow (not focusable). */
function makeHeaderRow(): FlatRow {
  return { kind: 'sectionHeader', sectionId: 'section-1' }
}

/** Create a selected-cell-keys set from (row, col) pairs. */
function keys(...pairs: Array<[number, number]>): Set<string> {
  return new Set(pairs.map(([r, c]) => `${r}:${c}`))
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('planShift — shift forward into empty target', () => {
  it('one-cell shift forward by 1 into an empty target → 1 update (source clear) + 1 create', () => {
    const periods = [makePeriod(0), makePeriod(1), makePeriod(2)]

    const srcLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 500 })
    const lineMap = new Map([['period-0', srcLine]])
    // period-1 has no line in lineMap → target is empty

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    const plan = planShift(keys([0, 0]), 1, flatRows, periods)

    // One update: source cleared to 0
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toEqual({ id: 'line-src', amount: 0 })

    // One create for the target period
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0]).toMatchObject({
      entityId: 'entity-1',
      categoryId: 'cat-1',
      periodId: 'period-1',
      amount: 500,
      counterparty: 'Acme Corp',
      notes: 'quarterly',
      lineStatus: 'confirmed',
      sourceLineId: 'line-src',
    })
    expect(plan.creates[0]!.tempId).toMatch(/^temp-/)

    expect(plan.collisions).toBe(0)
    expect(plan.skipped).toBe(0)
  })
})

describe('planShift — shift into an existing editable target', () => {
  it('one-cell forward shift into a non-zero existing target → 2 updates, 0 creates, collisions=1', () => {
    const periods = [makePeriod(0), makePeriod(1)]

    const srcLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 300 })
    const tgtLine = makeLine({ id: 'line-tgt', periodId: 'period-1', amount: 999 })
    const lineMap = new Map([
      ['period-0', srcLine],
      ['period-1', tgtLine],
    ])

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    const plan = planShift(keys([0, 0]), 1, flatRows, periods)

    expect(plan.creates).toHaveLength(0)
    // source cleared + target overwritten
    expect(plan.updates).toHaveLength(2)
    const srcUpdate = plan.updates.find((u) => u.id === 'line-src')!
    const tgtUpdate = plan.updates.find((u) => u.id === 'line-tgt')!
    expect(srcUpdate.amount).toBe(0)
    expect(tgtUpdate.amount).toBe(300)
    expect(plan.collisions).toBe(1)
    expect(plan.skipped).toBe(0)
  })
})

describe('planShift — multi-cell shift across week boundary', () => {
  it('multi-cell shift — mix of update target and create target', () => {
    // Row 0 (item): 3 periods
    //   col0: line with amount 100 → col1: has existing line (update + collision)
    //   col1: line with amount 200 → col2: no line (create)
    //
    // period-2 has no line so the shift from col1 produces a create, not an update.

    const periods = [makePeriod(0), makePeriod(1), makePeriod(2)]

    const l0 = makeLine({ id: 'l0', periodId: 'period-0', amount: 100 })
    const l1 = makeLine({ id: 'l1', periodId: 'period-1', amount: 200 })
    // period-2 intentionally absent → empty target for col1's shift

    const lineMap = new Map([
      ['period-0', l0],
      ['period-1', l1],
    ])

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    // Select col0 and col1, shift +1
    const plan = planShift(keys([0, 0], [0, 1]), 1, flatRows, periods)

    // col0 → col1: l1 exists (overwritten by 100) → update, collision
    // col1 → col2: no line → create (amount 200)

    // Creates: 1 (for the empty period-2 target)
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0]).toMatchObject({
      periodId: 'period-2',
      amount: 200,
    })
    expect(plan.creates[0]!.tempId).toMatch(/^temp-/)

    // Updates: l0 cleared to 0, l1 overwritten to 100, l1 also cleared to 0 (as source)
    // col0 source (l0) → amount=0, col1 target (l1) → amount=100, col1 source (l1) → amount=0
    // l0 clear + l1 overwrite (as target of col0) + l1 clear (as source for col1) = 3 updates
    expect(plan.updates.length).toBe(3)
    const l0Update = plan.updates.find((u) => u.id === 'l0')!
    expect(l0Update.amount).toBe(0)
    const l1Updates = plan.updates.filter((u) => u.id === 'l1')
    // l1 is both the target of col0 (overwritten to 100) and the source of col1 (cleared to 0)
    expect(l1Updates.length).toBe(2)

    expect(plan.collisions).toBe(1)
    expect(plan.skipped).toBe(0)
  })
})

describe('planShift — out-of-range target', () => {
  it('shift that takes a cell past the last period is skipped', () => {
    const periods = [makePeriod(0), makePeriod(1)]

    const srcLine = makeLine({ id: 'line-src', periodId: 'period-1', amount: 400 })
    const lineMap = new Map([['period-1', srcLine]])

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    // col=1, shift +1 → targetCol=2 which is >= periods.length
    const plan = planShift(keys([0, 1]), 1, flatRows, periods)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })
})

describe('planShift — negative N (shift backward)', () => {
  it('shift backward by 1 — source at col 1 moves to col 0', () => {
    const periods = [makePeriod(0), makePeriod(1)]

    const srcLine = makeLine({ id: 'line-src', periodId: 'period-1', amount: 750 })
    const lineMap = new Map([['period-1', srcLine]])
    // period-0 has no line → create

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    const plan = planShift(keys([0, 1]), -1, flatRows, periods)

    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toEqual({ id: 'line-src', amount: 0 })
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0]!.periodId).toBe('period-0')
    expect(plan.creates[0]!.amount).toBe(750)
    expect(plan.collisions).toBe(0)
  })
})

describe('planShift — source pipeline → skip', () => {
  it('pipeline source line is not shifted', () => {
    const periods = [makePeriod(0), makePeriod(1)]

    const srcLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 1000, source: 'pipeline' })
    const lineMap = new Map([['period-0', srcLine]])

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    const plan = planShift(keys([0, 0]), 1, flatRows, periods)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })
})

describe('planShift — target pipeline → skip', () => {
  it('pipeline target line blocks the shift', () => {
    const periods = [makePeriod(0), makePeriod(1)]

    const srcLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 500 })
    const tgtLine = makeLine({ id: 'line-tgt', periodId: 'period-1', amount: 200, source: 'pipeline' })
    const lineMap = new Map([
      ['period-0', srcLine],
      ['period-1', tgtLine],
    ])

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    const plan = planShift(keys([0, 0]), 1, flatRows, periods)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })
})

describe('planShift — source amount === 0 → skip', () => {
  it('zero-amount source cell is skipped', () => {
    const periods = [makePeriod(0), makePeriod(1)]

    const srcLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 0 })
    const lineMap = new Map([['period-0', srcLine]])

    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    const plan = planShift(keys([0, 0]), 1, flatRows, periods)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })
})

describe('planShift — empty selection', () => {
  it('empty selection produces an empty plan', () => {
    const periods = [makePeriod(0), makePeriod(1)]
    const srcLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 100 })
    const lineMap = new Map([['period-0', srcLine]])
    const flatRows: FlatRow[] = [makeItemRow(lineMap)]

    const plan = planShift(new Set<string>(), 1, flatRows, periods)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.collisions).toBe(0)
    expect(plan.skipped).toBe(0)
  })
})

describe('planShift — non-item row skipped', () => {
  it('sectionHeader rows in the selection are skipped', () => {
    const periods = [makePeriod(0), makePeriod(1)]
    // Row 0 is a header
    const flatRows: FlatRow[] = [makeHeaderRow()]

    const plan = planShift(keys([0, 0]), 1, flatRows, periods)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })
})

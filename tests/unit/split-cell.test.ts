import { describe, expect, it } from 'vitest'
import { parseSplitAmounts, planSplitCell } from '@/lib/forecast/split-cell'
import type { SplitCellArgs } from '@/lib/forecast/split-cell'
import type { ForecastLine } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<ForecastLine> = {}): ForecastLine {
  return {
    id: `line-${Math.random().toString(36).slice(2)}`,
    entityId: 'entity-1',
    categoryId: 'cat-1',
    periodId: 'period-0',
    amount: 5000,
    confidence: 100,
    source: 'manual',
    counterparty: 'Acme Corp',
    notes: 'quarterly invoice',
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'confirmed',
    formula: null,
    ...overrides,
  }
}

function makePeriod(idx: number) {
  return { id: `period-${idx}` }
}

function makeArgs(overrides: Partial<SplitCellArgs> = {}): SplitCellArgs {
  const sourceLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 10000 })
  const lineByPeriod = new Map([['period-0', sourceLine]])
  return {
    sourceLine,
    sourceRow: { kind: 'item', lineByPeriod, isPipeline: false },
    sourceCol: 0,
    amounts: [4000, 6000],
    periods: [makePeriod(0), makePeriod(1), makePeriod(2)],
    ...overrides,
  }
}

// ── parseSplitAmounts ─────────────────────────────────────────────────────────

describe('parseSplitAmounts', () => {
  it('test 1: parses "4000, 6000" → [4000, 6000]', () => {
    const result = parseSplitAmounts('4000, 6000')
    expect(result).toEqual({ ok: true, values: [4000, 6000] })
  })

  it('test 2: strips $ and , inside tokens — "$1,500, $500" → [1500, 500]', () => {
    const result = parseSplitAmounts('$1,500, $500')
    expect(result).toEqual({ ok: true, values: [1500, 500] })
  })

  it('test 3: single value "1000" → error (at least two required)', () => {
    const result = parseSplitAmounts('1000')
    expect(result.ok).toBe(false)
  })

  it('test 4: non-numeric token "abc, 500" → error', () => {
    const result = parseSplitAmounts('abc, 500')
    expect(result.ok).toBe(false)
  })

  it('test 5: empty string → error', () => {
    const result = parseSplitAmounts('')
    expect(result.ok).toBe(false)
  })
})

// ── planSplitCell ─────────────────────────────────────────────────────────────

describe('planSplitCell', () => {
  it('test 6: empty target col → 1 update (source) + 1 create', () => {
    const args = makeArgs({
      amounts: [4000, 6000],
      // period-1 has no entry in lineByPeriod → empty target
    })
    const plan = planSplitCell(args)

    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toEqual({ id: 'line-src', amount: 4000 })

    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0]).toMatchObject({
      entityId: 'entity-1',
      categoryId: 'cat-1',
      periodId: 'period-1',
      amount: 6000,
      counterparty: 'Acme Corp',
      notes: 'quarterly invoice',
      lineStatus: 'confirmed',
    })

    expect(plan.collisions).toBe(0)
    expect(plan.skipped).toBe(0)
  })

  it('test 7: existing editable target → 2 updates, collisions: 1', () => {
    const sourceLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 10000 })
    const targetLine = makeLine({ id: 'line-tgt', periodId: 'period-1', amount: 3000 })
    const lineByPeriod = new Map([
      ['period-0', sourceLine],
      ['period-1', targetLine],
    ])
    const args: SplitCellArgs = {
      sourceLine,
      sourceRow: { kind: 'item', lineByPeriod, isPipeline: false },
      sourceCol: 0,
      amounts: [4000, 6000],
      periods: [makePeriod(0), makePeriod(1), makePeriod(2)],
    }

    const plan = planSplitCell(args)

    expect(plan.updates).toHaveLength(2)
    expect(plan.updates[0]).toEqual({ id: 'line-src', amount: 4000 })
    expect(plan.updates[1]).toEqual({ id: 'line-tgt', amount: 6000 })

    expect(plan.creates).toHaveLength(0)
    expect(plan.collisions).toBe(1)
    expect(plan.skipped).toBe(0)
  })

  it('test 8: N=3 values across all empty targets → 1 update + 2 creates', () => {
    const args = makeArgs({
      amounts: [1000, 2000, 3000],
      // period-1 and period-2 are both empty
    })
    const plan = planSplitCell(args)

    expect(plan.updates).toHaveLength(1)
    expect(plan.creates).toHaveLength(2)
    expect(plan.creates[0]).toMatchObject({ periodId: 'period-1', amount: 2000 })
    expect(plan.creates[1]).toMatchObject({ periodId: 'period-2', amount: 3000 })
    expect(plan.collisions).toBe(0)
    expect(plan.skipped).toBe(0)
  })

  it('test 9: target out of horizon → skipped count', () => {
    // Only 2 periods total; sourceCol=0; amounts has 3 values → period-2 is out of range.
    const sourceLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 9000 })
    const lineByPeriod = new Map([['period-0', sourceLine]])
    const args: SplitCellArgs = {
      sourceLine,
      sourceRow: { kind: 'item', lineByPeriod, isPipeline: false },
      sourceCol: 0,
      amounts: [1000, 2000, 3000],
      periods: [makePeriod(0), makePeriod(1)], // only 2 periods
    }

    const plan = planSplitCell(args)

    // amounts[0] → update source
    // amounts[1] → create at period-1 (in range)
    // amounts[2] → skipped (period-2 out of range)
    expect(plan.updates).toHaveLength(1)
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0]).toMatchObject({ periodId: 'period-1', amount: 2000 })
    expect(plan.skipped).toBe(1)
  })

  it('test 10: target pipeline → skipped count', () => {
    const sourceLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 10000 })
    const pipelineLine = makeLine({
      id: 'line-pipe',
      periodId: 'period-1',
      source: 'pipeline',
      amount: 5000,
    })
    const lineByPeriod = new Map([
      ['period-0', sourceLine],
      ['period-1', pipelineLine],
    ])
    const args: SplitCellArgs = {
      sourceLine,
      sourceRow: { kind: 'item', lineByPeriod, isPipeline: false },
      sourceCol: 0,
      amounts: [4000, 6000],
      periods: [makePeriod(0), makePeriod(1), makePeriod(2)],
    }

    const plan = planSplitCell(args)

    // Source gets updated; pipeline target is skipped.
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toEqual({ id: 'line-src', amount: 4000 })
    expect(plan.creates).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })

  it('test 11: sourceRow.isPipeline = true → empty plan', () => {
    const sourceLine = makeLine({ id: 'line-src', periodId: 'period-0', amount: 10000 })
    const lineByPeriod = new Map([['period-0', sourceLine]])
    const args: SplitCellArgs = {
      sourceLine,
      sourceRow: { kind: 'item', lineByPeriod, isPipeline: true },
      sourceCol: 0,
      amounts: [4000, 6000],
      periods: [makePeriod(0), makePeriod(1), makePeriod(2)],
    }

    const plan = planSplitCell(args)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.collisions).toBe(0)
    expect(plan.skipped).toBe(0)
  })

  it('test 12: amounts: [] → empty plan', () => {
    const args = makeArgs({ amounts: [] })
    const plan = planSplitCell(args)

    expect(plan.updates).toHaveLength(0)
    expect(plan.creates).toHaveLength(0)
    expect(plan.collisions).toBe(0)
    expect(plan.skipped).toBe(0)
  })
})

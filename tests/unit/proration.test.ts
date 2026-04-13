import { describe, it, expect } from 'vitest'
import { prorateSubtotal } from '@/lib/forecast/proration'
import type { ForecastLine, LineStatus, SourceType } from '@/lib/types'

interface MakeLineOverrides {
  id?: string
  entityId?: string
  categoryId?: string
  periodId?: string
  amount?: number
  confidence?: number
  source?: SourceType
  counterparty?: string | null
  notes?: string | null
  sourceDocumentId?: string | null
  sourceRuleId?: string | null
  sourcePipelineProjectId?: string | null
  lineStatus?: LineStatus
}

let idCounter = 0
function makeLine(overrides: MakeLineOverrides = {}): ForecastLine {
  idCounter += 1
  return {
    id: overrides.id ?? `line-${idCounter}`,
    entityId: overrides.entityId ?? 'e1',
    categoryId: overrides.categoryId ?? 'cat-a',
    periodId: overrides.periodId ?? 'p1',
    amount: overrides.amount ?? 0,
    confidence: overrides.confidence ?? 100,
    source: overrides.source ?? 'manual',
    counterparty: overrides.counterparty ?? null,
    notes: overrides.notes ?? null,
    sourceDocumentId: overrides.sourceDocumentId ?? null,
    sourceRuleId: overrides.sourceRuleId ?? null,
    sourcePipelineProjectId: overrides.sourcePipelineProjectId ?? null,
    lineStatus: overrides.lineStatus ?? 'confirmed',
    formula: null,
  }
}

// Seed categories — all in the "outflows_payroll" sub-group for these tests
const PAYROLL_SUBS = ['outflows_payroll_salaries', 'outflows_payroll_super', 'outflows_payroll_tax']

describe('prorateSubtotal', () => {
  it('proportionally scales two lines from subtotal 60 to 90 → [60, 30]', () => {
    const lines = [
      makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: 40 }),
      makeLine({ id: 'b', categoryId: 'outflows_payroll_super', amount: 20 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 90)

    expect(result.reason).toBe('ok')
    expect(result.updated[0]!.amount).toBe(60)
    expect(result.updated[1]!.amount).toBe(30)
    expect(result.changed).toEqual([
      { id: 'a', amount: 60 },
      { id: 'b', amount: 30 },
    ])
    expect(result.skippedPipeline).toBe(0)
  })

  it('handles a single editable line: [100] → 50 → [50]', () => {
    const lines = [makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: 100 })]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 50)

    expect(result.updated[0]!.amount).toBe(50)
    expect(result.changed).toEqual([{ id: 'a', amount: 50 }])
    expect(result.reason).toBe('ok')
  })

  it('even-splits zero starting total across 3 lines: [0,0,0] → 300 → [100,100,100], sum exact', () => {
    const lines = [
      makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: 0 }),
      makeLine({ id: 'b', categoryId: 'outflows_payroll_super', amount: 0 }),
      makeLine({ id: 'c', categoryId: 'outflows_payroll_tax', amount: 0 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 300)

    expect(result.updated.map((l) => l.amount)).toEqual([100, 100, 100])
    const sum = result.updated.reduce((s, l) => s + l.amount, 0)
    expect(sum).toBe(300)
  })

  it('even-split absorbs rounding error in the last line: [0,0,0] → 100 → [33,33,34]', () => {
    const lines = [
      makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: 0 }),
      makeLine({ id: 'b', categoryId: 'outflows_payroll_super', amount: 0 }),
      makeLine({ id: 'c', categoryId: 'outflows_payroll_tax', amount: 0 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 100)

    expect(result.updated[0]!.amount).toBe(33)
    expect(result.updated[1]!.amount).toBe(33)
    expect(result.updated[2]!.amount).toBe(34)
    const sum = result.updated.reduce((s, l) => s + l.amount, 0)
    expect(sum).toBe(100)
  })

  it('skips pipeline-sourced lines and scales only editable ones', () => {
    const lines = [
      makeLine({ id: 'edit', categoryId: 'outflows_payroll_salaries', amount: -100, source: 'manual' }),
      makeLine({ id: 'pipe', categoryId: 'outflows_payroll_super', amount: -50, source: 'pipeline' }),
    ]

    // We want the editable line to cover subtotal -200 (pipeline untouched)
    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', -200)

    expect(result.skippedPipeline).toBe(1)
    expect(result.reason).toBe('ok')
    // Editable scaled: -100 * (-200 / -100) = -200
    expect(result.updated[0]!.amount).toBe(-200)
    // Pipeline untouched
    expect(result.updated[1]!.amount).toBe(-50)
    expect(result.changed).toEqual([{ id: 'edit', amount: -200 }])
  })

  it('returns reason "all-pipeline" when every matching line is pipeline-sourced', () => {
    const lines = [
      makeLine({ id: 'p1l', categoryId: 'outflows_payroll_salaries', amount: -100, source: 'pipeline' }),
      makeLine({ id: 'p2l', categoryId: 'outflows_payroll_super', amount: -50, source: 'pipeline' }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', -300)

    expect(result.reason).toBe('all-pipeline')
    expect(result.skippedPipeline).toBe(2)
    expect(result.changed).toEqual([])
    // No lines modified
    expect(result.updated[0]!.amount).toBe(-100)
    expect(result.updated[1]!.amount).toBe(-50)
  })

  it('returns reason "no-lines" when no lines match the category/period filter', () => {
    const lines = [
      makeLine({ id: 'x', categoryId: 'some_other_category', amount: 100 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 500)

    expect(result.reason).toBe('no-lines')
    expect(result.changed).toEqual([])
    expect(result.skippedPipeline).toBe(0)
  })

  it('leaves lines in other periods untouched', () => {
    const lines = [
      makeLine({ id: 'p1-a', periodId: 'p1', categoryId: 'outflows_payroll_salaries', amount: 40 }),
      makeLine({ id: 'p1-b', periodId: 'p1', categoryId: 'outflows_payroll_super', amount: 20 }),
      makeLine({ id: 'p2-a', periodId: 'p2', categoryId: 'outflows_payroll_salaries', amount: 40 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 90)

    expect(result.updated[0]!.amount).toBe(60)
    expect(result.updated[1]!.amount).toBe(30)
    // p2 line untouched AND same reference
    expect(result.updated[2]).toBe(lines[2])
    expect(result.updated[2]!.amount).toBe(40)
    expect(result.changed.map((c) => c.id).sort()).toEqual(['p1-a', 'p1-b'])
  })

  it('leaves lines in other categories untouched', () => {
    const lines = [
      makeLine({ id: 'pay', categoryId: 'outflows_payroll_salaries', amount: 100 }),
      makeLine({ id: 'rent', categoryId: 'outflows_rent', amount: 500 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 250)

    expect(result.updated[0]!.amount).toBe(250)
    expect(result.updated[1]).toBe(lines[1]) // same reference — unchanged
    expect(result.updated[1]!.amount).toBe(500)
    expect(result.changed).toEqual([{ id: 'pay', amount: 250 }])
  })

  it('handles negative outflow amounts proportionally: [-1000,-500] → -2250 → [-1500,-750]', () => {
    const lines = [
      makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: -1000 }),
      makeLine({ id: 'b', categoryId: 'outflows_payroll_super', amount: -500 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', -2250)

    expect(result.updated[0]!.amount).toBe(-1500)
    expect(result.updated[1]!.amount).toBe(-750)
    expect(result.reason).toBe('ok')
  })

  it('does not mutate the input array or input line objects', () => {
    const original0 = makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: 40 })
    const original1 = makeLine({ id: 'b', categoryId: 'outflows_payroll_super', amount: 20 })
    const lines = [original0, original1]
    const snapshot = lines.map((l) => ({ ...l }))

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 90)

    // Different array
    expect(result.updated).not.toBe(lines)
    // Input array unchanged
    expect(lines[0]).toBe(original0)
    expect(lines[1]).toBe(original1)
    // Input line values unchanged
    expect(lines[0]!.amount).toBe(snapshot[0]!.amount)
    expect(lines[1]!.amount).toBe(snapshot[1]!.amount)
    // Updated lines are new objects (they changed)
    expect(result.updated[0]).not.toBe(original0)
    expect(result.updated[1]).not.toBe(original1)
  })

  it('preserves reference identity for unchanged (non-matching) lines', () => {
    const keep = makeLine({ id: 'keep', categoryId: 'outflows_rent', amount: 500, periodId: 'p1' })
    const keep2 = makeLine({ id: 'keep2', categoryId: 'outflows_payroll_salaries', amount: 40, periodId: 'p2' })
    const change = makeLine({ id: 'change', categoryId: 'outflows_payroll_salaries', amount: 40, periodId: 'p1' })
    const lines = [keep, keep2, change]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 80)

    expect(result.updated[0]).toBe(keep)
    expect(result.updated[1]).toBe(keep2)
    expect(result.updated[2]).not.toBe(change)
    expect(result.updated[2]!.amount).toBe(80)
  })

  it('changed list contains only lines whose amount actually differs', () => {
    // Scaling by 1 (newTotal == currentTotal) means no line changes
    const lines = [
      makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: 40 }),
      makeLine({ id: 'b', categoryId: 'outflows_payroll_super', amount: 20 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 60)

    expect(result.reason).toBe('ok')
    expect(result.changed).toEqual([])
    // All lines preserve reference identity because nothing changed
    expect(result.updated[0]).toBe(lines[0])
    expect(result.updated[1]).toBe(lines[1])
  })

  it('mixed editable + pipeline: scales editable, reports skipped count, preserves pipeline values', () => {
    const lines = [
      makeLine({ id: 'e1', categoryId: 'outflows_payroll_salaries', amount: 30, source: 'manual' }),
      makeLine({ id: 'e2', categoryId: 'outflows_payroll_super', amount: 10, source: 'document' }),
      makeLine({ id: 'p1l', categoryId: 'outflows_payroll_tax', amount: 25, source: 'pipeline' }),
    ]

    // currentEditableTotal = 40, newTotal = 80 → scale = 2
    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 80)

    expect(result.updated[0]!.amount).toBe(60)
    expect(result.updated[1]!.amount).toBe(20)
    expect(result.updated[2]!.amount).toBe(25) // pipeline untouched
    expect(result.skippedPipeline).toBe(1)
    expect(result.changed).toEqual([
      { id: 'e1', amount: 60 },
      { id: 'e2', amount: 20 },
    ])
  })

  it('proportional path: sum of rounded values equals newTotal exactly (running-sum correction)', () => {
    // 3 lines whose naive per-line rounding would accumulate drift.
    const lines = [
      makeLine({ id: 'a', categoryId: 'outflows_payroll_salaries', amount: 33 }),
      makeLine({ id: 'b', categoryId: 'outflows_payroll_super', amount: 33 }),
      makeLine({ id: 'c', categoryId: 'outflows_payroll_tax', amount: 34 }),
    ]

    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', 101)
    const sum = result.updated.reduce((s, l) => s + l.amount, 0)
    expect(sum).toBe(101)
  })

  it('proportional path with many lines: sum always equals newTotal', () => {
    const lines = Array.from({ length: 15 }, (_, i) =>
      makeLine({ id: `l${i}`, categoryId: 'outflows_payroll_salaries', amount: 7 + (i % 3) }),
    )
    const current = lines.reduce((s, l) => s + l.amount, 0)
    const result = prorateSubtotal(lines, PAYROLL_SUBS, 'p1', current * 2 + 7)
    const sum = result.updated.reduce((s, l) => s + l.amount, 0)
    expect(sum).toBe(current * 2 + 7)
  })
})

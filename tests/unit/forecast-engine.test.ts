import { describe, it, expect } from 'vitest'
import {
  computeWeekSummaries,
  applyConfidenceWeighting,
} from '@/lib/forecast/engine'
import type { ForecastLine, Period, Category } from '@/lib/types'

const period = (id: string, weekEnding: string): Period => ({
  id,
  weekEnding,
  isActual: false,
})

const line = (
  periodId: string,
  amount: number,
  categoryCode: string,
  confidence = 100,
): ForecastLine => ({
  id: `line-${Math.random()}`,
  entityId: 'e1',
  categoryId: categoryCode,
  periodId,
  amount,
  confidence,
  source: confidence < 100 ? 'pipeline' : 'manual',
  counterparty: null,
  notes: null,
  sourceDocumentId: null,
  sourceRuleId: null,
  sourcePipelineProjectId: null,
  lineStatus: 'confirmed',
  formula: null,
})

const categories: Category[] = [
  { id: 'opening', parentId: null, name: 'Opening', code: 'opening', sectionNumber: '1', sortOrder: 100, flowDirection: 'balance' },
  { id: 'inflows', parentId: null, name: 'Inflows', code: 'inflows', sectionNumber: '2', sortOrder: 200, flowDirection: 'inflow' },
  { id: 'inflows_ar', parentId: 'inflows', name: 'AR', code: 'inflows_ar', sectionNumber: '2a', sortOrder: 210, flowDirection: 'inflow' },
  { id: 'outflows', parentId: null, name: 'Outflows', code: 'outflows', sectionNumber: '3', sortOrder: 300, flowDirection: 'outflow' },
  { id: 'outflows_payroll', parentId: 'outflows', name: 'Payroll', code: 'outflows_payroll', sectionNumber: '3a', sortOrder: 310, flowDirection: 'outflow' },
  { id: 'loans', parentId: null, name: 'Loans', code: 'loans', sectionNumber: '4', sortOrder: 400, flowDirection: 'outflow' },
  { id: 'closing', parentId: null, name: 'Closing', code: 'closing', sectionNumber: '5', sortOrder: 500, flowDirection: 'computed' },
]

describe('computeWeekSummaries', () => {
  it('calculates closing balance from opening + inflows - outflows', () => {
    const periods = [period('p1', '2026-03-27')]
    const lines = [
      line('p1', -500000, 'opening'),
      line('p1', 100000, 'inflows_ar'),
      line('p1', -60000, 'outflows_payroll'),
      line('p1', -10000, 'loans'),
    ]

    const result = computeWeekSummaries(periods, lines, categories, 900000, false)

    expect(result).toHaveLength(1)
    expect(result[0].openingBalance).toBe(-500000)
    expect(result[0].totalInflows).toBe(100000)
    expect(result[0].totalOutflows).toBe(-60000)
    expect(result[0].loansAndFinancing).toBe(-10000)
    expect(result[0].closingBalance).toBe(-470000)
    expect(result[0].availableCash).toBe(430000)
    expect(result[0].isOverdrawn).toBe(false)
  })

  it('rolls closing balance forward as next week opening', () => {
    const periods = [period('p1', '2026-03-27'), period('p2', '2026-04-03')]
    const lines = [
      line('p1', -500000, 'opening'),
      line('p1', 200000, 'inflows_ar'),
      line('p2', 50000, 'inflows_ar'),
    ]

    const result = computeWeekSummaries(periods, lines, categories, 900000, false)

    expect(result[0].closingBalance).toBe(-300000)
    expect(result[1].openingBalance).toBe(-300000)
    expect(result[1].closingBalance).toBe(-250000)
  })

  it('detects OD breach when available cash < 0', () => {
    const periods = [period('p1', '2026-03-27')]
    const lines = [
      line('p1', -1000000, 'opening'),
    ]

    const result = computeWeekSummaries(periods, lines, categories, 900000, false)

    expect(result[0].closingBalance).toBe(-1000000)
    expect(result[0].availableCash).toBe(-100000)
    expect(result[0].isOverdrawn).toBe(true)
  })

  it('applies confidence weighting when weighted=true', () => {
    const periods = [period('p1', '2026-03-27')]
    const lines = [
      line('p1', 0, 'opening'),
      line('p1', 100000, 'inflows_ar', 70),
    ]

    const result = computeWeekSummaries(periods, lines, categories, 0, true)

    expect(result[0].totalInflows).toBe(70000)
    expect(result[0].closingBalance).toBe(70000)
  })

  it('shows full amount when weighted=false', () => {
    const periods = [period('p1', '2026-03-27')]
    const lines = [
      line('p1', 0, 'opening'),
      line('p1', 100000, 'inflows_ar', 70),
    ]

    const result = computeWeekSummaries(periods, lines, categories, 0, false)

    expect(result[0].totalInflows).toBe(100000)
  })
})

describe('computeWeekSummaries — cascading recompute', () => {
  it('propagates a single line edit to closing balance of all subsequent weeks', () => {
    const periods = [
      period('p1', '2026-03-27'),
      period('p2', '2026-04-03'),
      period('p3', '2026-04-10'),
    ]

    const baseLines = [
      line('p1', -500000, 'opening'),
      line('p1', 100000, 'inflows_ar'),
      line('p2', 100000, 'inflows_ar'),
      line('p3', 100000, 'inflows_ar'),
    ]

    const before = computeWeekSummaries(periods, baseLines, categories, 900000, false)
    expect(before[0].closingBalance).toBe(-400000)
    expect(before[1].closingBalance).toBe(-300000)
    expect(before[2].closingBalance).toBe(-200000)

    // Simulate edit: increase p1's AR by +50k — closings shift for p1, p2, p3.
    const edited = baseLines.map((l, i) => (i === 1 ? { ...l, amount: 150000 } : l))

    const after = computeWeekSummaries(periods, edited, categories, 900000, false)
    expect(after[0].closingBalance).toBe(-350000)
    expect(after[1].closingBalance).toBe(-250000)
    expect(after[2].closingBalance).toBe(-150000)

    // Availability (incl. OD) cascades too
    expect(after[0].availableCash).toBe(before[0].availableCash + 50000)
    expect(after[2].availableCash).toBe(before[2].availableCash + 50000)
  })
})

describe('applyConfidenceWeighting', () => {
  it('multiplies amount by confidence/100', () => {
    expect(applyConfidenceWeighting(100000, 70)).toBe(70000)
    expect(applyConfidenceWeighting(100000, 100)).toBe(100000)
    expect(applyConfidenceWeighting(-50000, 50)).toBe(-25000)
  })
})

import { describe, it, expect } from 'vitest'
import { computeBUSummary } from '@/lib/pipeline/summary'
import type { PipelineProjectRow } from '@/lib/pipeline/types'

const months = ['2026-04-01', '2026-05-01', '2026-06-01']

const makeProject = (
  entityId: string,
  stage: string,
  allocations: { month: string; amount: number }[],
): PipelineProjectRow => ({
  id: `p-${Math.random()}`,
  clientId: 'c1',
  entityId,
  jobNumber: null,
  projectName: 'Test',
  taskEstimate: null,
  stage: stage as any,
  teamMember: null,
  billingAmount: null,
  thirdPartyCosts: null,
  grossProfit: null,
  invoiceDate: null,
  notes: null,
  isSynced: true,
  createdBy: null,
  clientName: 'Test Client',
  allocations: allocations.map((a, i) => ({
    id: `a-${i}`,
    projectId: 'p1',
    month: a.month,
    amount: a.amount,
    distribution: 'even' as const,
  })),
  totalAmount: allocations.reduce((s, a) => s + a.amount, 0),
})

const entities = [
  { id: 'aug', name: 'Augusto' },
  { id: 'cnr', name: 'Cornerstore' },
]

const targets = [
  { id: 't1', entityId: 'aug', month: '2026-04-01', targetAmount: 325000 },
  { id: 't2', entityId: 'aug', month: '2026-05-01', targetAmount: 325000 },
  { id: 't3', entityId: 'aug', month: '2026-06-01', targetAmount: 325000 },
]

describe('computeBUSummary', () => {
  it('sums confirmed + awaiting_approval into confirmedAndAwaiting', () => {
    const projects = [
      makeProject('aug', 'confirmed', [{ month: '2026-04-01', amount: 50000 }]),
      makeProject('aug', 'awaiting_approval', [{ month: '2026-04-01', amount: 20000 }]),
      makeProject('aug', 'speculative', [{ month: '2026-04-01', amount: 100000 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    expect(aug.confirmedAndAwaiting[0]).toBe(70000)
    expect(aug.upcomingAndSpeculative[0]).toBe(100000)
    expect(aug.totalForecast[0]).toBe(170000)
  })

  it('computes variance as confirmed - target (negative when under)', () => {
    const projects = [
      makeProject('aug', 'confirmed', [{ month: '2026-04-01', amount: 50000 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    expect(aug.variance[0]).toBe(50000 - 325000)
  })

  it('computes P&L forecast with weighted stages', () => {
    const projects = [
      makeProject('aug', 'confirmed', [{ month: '2026-04-01', amount: 100000 }]),
      makeProject('aug', 'awaiting_approval', [{ month: '2026-04-01', amount: 60000 }]),
      makeProject('aug', 'speculative', [{ month: '2026-04-01', amount: 80000 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    // 100000*1.0 + 60000*0.5 + 80000*0.5 = 170000
    expect(aug.pnlForecast[0]).toBe(170000)
  })

  it('excludes declined projects from all calculations', () => {
    const projects = [
      makeProject('aug', 'declined', [{ month: '2026-04-01', amount: 999999 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    expect(aug.confirmedAndAwaiting[0]).toBe(0)
    expect(aug.totalForecast[0]).toBe(0)
  })
})

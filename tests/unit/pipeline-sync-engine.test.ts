import { describe, it, expect } from 'vitest'
import { computeSyncLines } from '@/lib/pipeline/sync-engine'
import type { PipelineAllocation } from '@/lib/pipeline/types'

const ENTITY_ID = 'e1'
const PROJECT_ID = 'p1'
const CLIENT_NAME = 'adidas'
const BANK_ACCOUNT_ID = 'ba1'
const AR_CATEGORY_ID = 'cat-ar'

describe('computeSyncLines', () => {
  const weekEndings = ['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24']
  const periodMap: Record<string, string> = {
    '2026-04-03': 'per-1',
    '2026-04-10': 'per-2',
    '2026-04-17': 'per-3',
    '2026-04-24': 'per-4',
  }

  it('distributes evenly across weeks in the month', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 100000,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'confirmed',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(4)
    expect(lines[0].amount).toBe(25000)
    expect(lines[0].confidence).toBe(100)
    expect(lines[0].lineStatus).toBe('confirmed')
    expect(lines[0].periodId).toBe('per-1')
    expect(lines[0].source).toBe('pipeline')
    expect(lines[0].counterparty).toBe('adidas')
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(100000)
  })

  it('puts full amount on first week when distribution is first_week', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 60000,
      distribution: 'first_week',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'awaiting_approval',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(60000)
    expect(lines[0].confidence).toBe(80)
    expect(lines[0].lineStatus).toBe('awaiting_budget_approval')
    expect(lines[0].periodId).toBe('per-1')
  })

  it('puts full amount on last week when distribution is last_week', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 60000,
      distribution: 'last_week',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'upcoming',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(60000)
    expect(lines[0].confidence).toBe(50)
    expect(lines[0].lineStatus).toBe('tbc')
    expect(lines[0].periodId).toBe('per-4')
  })

  it('returns empty array for declined stage', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 50000,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'declined',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(0)
  })

  it('returns empty array when no weeks exist for the month', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 50000,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'confirmed',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings: [],
      periodMap: {},
    })

    expect(lines).toHaveLength(0)
  })

  it('falls back to even distribution for custom (not yet implemented)', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 80000,
      distribution: 'custom',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'confirmed',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(4)
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(80000)
  })

  it('handles remainder cents by adding to last week on even distribution', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 100001,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'confirmed',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    const total = lines.reduce((s, l) => s + l.amount, 0)
    expect(total).toBe(100001)
  })
})

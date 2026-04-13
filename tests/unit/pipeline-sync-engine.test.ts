import { describe, it, expect } from 'vitest'
import { computeSyncLines } from '@/lib/pipeline/sync-engine'
import type { PipelineAllocation } from '@/lib/pipeline/types'
import type { PipelineStage } from '@/lib/types'

const ENTITY_ID = 'e1'
const PROJECT_ID = 'p1'
const CLIENT_NAME = 'adidas'
const BANK_ACCOUNT_ID = 'ba1'
const REVENUE_TRACKER_CATEGORY_ID = 'cat-revenue-tracker'
const THIRD_PARTY_CATEGORY_ID = 'cat-ap-third-party'

const weekEndings = ['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24']
const periodMap: Record<string, string> = {
  '2026-04-03': 'per-1',
  '2026-04-10': 'per-2',
  '2026-04-17': 'per-3',
  '2026-04-24': 'per-4',
}

function baseInput(overrides: {
  allocation: PipelineAllocation
  stage?: PipelineStage
  thirdPartyAmount?: number | null
  thirdPartyCategoryId?: string | null
  weekEndings?: string[]
  periodMap?: Record<string, string>
}) {
  return {
    allocation: overrides.allocation,
    stage: overrides.stage ?? ('confirmed' as PipelineStage),
    entityId: ENTITY_ID,
    projectId: PROJECT_ID,
    clientName: CLIENT_NAME,
    bankAccountId: BANK_ACCOUNT_ID,
    revenueTrackerCategoryId: REVENUE_TRACKER_CATEGORY_ID,
    thirdPartyCategoryId:
      overrides.thirdPartyCategoryId === undefined
        ? THIRD_PARTY_CATEGORY_ID
        : overrides.thirdPartyCategoryId,
    thirdPartyAmount: overrides.thirdPartyAmount ?? 0,
    weekEndings: overrides.weekEndings ?? weekEndings,
    periodMap: overrides.periodMap ?? periodMap,
  }
}

describe('computeSyncLines — confirmed-only gating', () => {
  const allocation: PipelineAllocation = {
    id: 'a1',
    projectId: PROJECT_ID,
    month: '2026-04-01',
    amount: 100000,
    distribution: 'even',
  }

  const nonConfirmedStages: PipelineStage[] = [
    'awaiting_approval',
    'upcoming',
    'speculative',
    'declined',
  ]

  for (const stage of nonConfirmedStages) {
    it(`returns empty array for ${stage} stage`, () => {
      const lines = computeSyncLines(
        baseInput({ allocation, stage, thirdPartyAmount: 2000 }),
      )
      expect(lines).toHaveLength(0)
    })
  }

  it('returns empty array when no weeks exist for the month', () => {
    const lines = computeSyncLines(
      baseInput({
        allocation,
        weekEndings: [],
        periodMap: {},
        thirdPartyAmount: 2000,
      }),
    )
    expect(lines).toHaveLength(0)
  })
})

describe('computeSyncLines — revenue lines target revenue_tracker', () => {
  it('distributes evenly across weeks in the month', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 100000,
      distribution: 'even',
    }

    const lines = computeSyncLines(baseInput({ allocation }))

    expect(lines).toHaveLength(4)
    expect(lines.every((l) => l.categoryId === REVENUE_TRACKER_CATEGORY_ID)).toBe(
      true,
    )
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

    const lines = computeSyncLines(baseInput({ allocation }))

    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(60000)
    expect(lines[0].confidence).toBe(100)
    expect(lines[0].lineStatus).toBe('confirmed')
    expect(lines[0].periodId).toBe('per-1')
    expect(lines[0].categoryId).toBe(REVENUE_TRACKER_CATEGORY_ID)
  })

  it('puts full amount on last week when distribution is last_week', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 60000,
      distribution: 'last_week',
    }

    const lines = computeSyncLines(baseInput({ allocation }))

    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(60000)
    expect(lines[0].periodId).toBe('per-4')
    expect(lines[0].categoryId).toBe(REVENUE_TRACKER_CATEGORY_ID)
  })

  it('falls back to even distribution for custom', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 80000,
      distribution: 'custom',
    }

    const lines = computeSyncLines(baseInput({ allocation }))

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

    const lines = computeSyncLines(baseInput({ allocation }))

    const total = lines.reduce((s, l) => s + l.amount, 0)
    expect(total).toBe(100001)
  })
})

describe('computeSyncLines — third-party cost emission', () => {
  const allocation: PipelineAllocation = {
    id: 'a1',
    projectId: PROJECT_ID,
    month: '2026-04-01',
    amount: 100000,
    distribution: 'even',
  }

  it('emits BOTH revenue and third-party lines when thirdPartyAmount > 0', () => {
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: 20000 }),
    )

    const revenue = lines.filter(
      (l) => l.categoryId === REVENUE_TRACKER_CATEGORY_ID,
    )
    const thirdParty = lines.filter(
      (l) => l.categoryId === THIRD_PARTY_CATEGORY_ID,
    )

    expect(revenue).toHaveLength(4)
    expect(thirdParty).toHaveLength(4)
  })

  it('revenue lines are positive; third-party lines are negative', () => {
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: 20000 }),
    )

    const revenue = lines.filter(
      (l) => l.categoryId === REVENUE_TRACKER_CATEGORY_ID,
    )
    const thirdParty = lines.filter(
      (l) => l.categoryId === THIRD_PARTY_CATEGORY_ID,
    )

    expect(revenue.every((l) => l.amount > 0)).toBe(true)
    expect(thirdParty.every((l) => l.amount < 0)).toBe(true)
    expect(thirdParty.reduce((s, l) => s + l.amount, 0)).toBe(-20000)
  })

  it('both line types carry the same sourcePipelineProjectId and counterparty', () => {
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: 15000 }),
    )

    expect(
      lines.every((l) => l.sourcePipelineProjectId === PROJECT_ID),
    ).toBe(true)
    expect(lines.every((l) => l.counterparty === CLIENT_NAME)).toBe(true)
    expect(lines.every((l) => l.source === 'pipeline')).toBe(true)
  })

  it('both line types use identical weekly distribution (same periodIds)', () => {
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: 40000 }),
    )

    const revenue = lines.filter(
      (l) => l.categoryId === REVENUE_TRACKER_CATEGORY_ID,
    )
    const thirdParty = lines.filter(
      (l) => l.categoryId === THIRD_PARTY_CATEGORY_ID,
    )

    const revPeriods = revenue.map((l) => l.periodId).sort()
    const tpPeriods = thirdParty.map((l) => l.periodId).sort()
    expect(revPeriods).toEqual(tpPeriods)
  })

  it('third-party distribution preserves the full project third_party_costs total', () => {
    const thirdPartyCosts = 12345
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: thirdPartyCosts }),
    )

    const thirdParty = lines.filter(
      (l) => l.categoryId === THIRD_PARTY_CATEGORY_ID,
    )
    const total = thirdParty.reduce((s, l) => s + l.amount, 0)
    // Negative, and absolute value equals the input (remainder pinned to last week).
    expect(Math.abs(total)).toBe(thirdPartyCosts)
  })

  it('emits only revenue lines when thirdPartyAmount is 0', () => {
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: 0 }),
    )
    expect(lines).toHaveLength(4)
    expect(
      lines.every((l) => l.categoryId === REVENUE_TRACKER_CATEGORY_ID),
    ).toBe(true)
  })

  it('emits only revenue lines when thirdPartyAmount is null', () => {
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: null }),
    )
    expect(lines).toHaveLength(4)
    expect(
      lines.every((l) => l.categoryId === REVENUE_TRACKER_CATEGORY_ID),
    ).toBe(true)
  })

  it('emits only revenue lines when thirdPartyCategoryId is null', () => {
    const lines = computeSyncLines(
      baseInput({
        allocation,
        thirdPartyAmount: 5000,
        thirdPartyCategoryId: null,
      }),
    )
    expect(lines).toHaveLength(4)
    expect(
      lines.every((l) => l.categoryId === REVENUE_TRACKER_CATEGORY_ID),
    ).toBe(true)
  })

  it('works with first_week distribution — both lines on first week', () => {
    const firstWeekAlloc: PipelineAllocation = {
      ...allocation,
      distribution: 'first_week',
    }
    const lines = computeSyncLines(
      baseInput({ allocation: firstWeekAlloc, thirdPartyAmount: 8000 }),
    )

    expect(lines).toHaveLength(2)
    const [rev, tp] = lines
    expect(rev.categoryId).toBe(REVENUE_TRACKER_CATEGORY_ID)
    expect(rev.periodId).toBe('per-1')
    expect(rev.amount).toBe(100000)
    expect(tp.categoryId).toBe(THIRD_PARTY_CATEGORY_ID)
    expect(tp.periodId).toBe('per-1')
    expect(tp.amount).toBe(-8000)
  })

  it('works with last_week distribution — both lines on last week', () => {
    const lastWeekAlloc: PipelineAllocation = {
      ...allocation,
      distribution: 'last_week',
    }
    const lines = computeSyncLines(
      baseInput({ allocation: lastWeekAlloc, thirdPartyAmount: 8000 }),
    )

    expect(lines).toHaveLength(2)
    const [rev, tp] = lines
    expect(rev.periodId).toBe('per-4')
    expect(rev.amount).toBe(100000)
    expect(tp.periodId).toBe('per-4')
    expect(tp.amount).toBe(-8000)
  })
})

describe('computeSyncLines — all emitted lines have confidence = 100', () => {
  it('sets confidence = 100 on every line (revenue + third-party)', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 50000,
      distribution: 'even',
    }
    const lines = computeSyncLines(
      baseInput({ allocation, thirdPartyAmount: 10000 }),
    )
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.confidence === 100)).toBe(true)
    expect(lines.every((l) => l.lineStatus === 'confirmed')).toBe(true)
  })
})

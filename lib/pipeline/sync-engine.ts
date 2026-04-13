import type { PipelineStage } from '@/lib/types'
import type { PipelineAllocation } from './types'

export interface SyncLineInput {
  allocation: PipelineAllocation
  stage: PipelineStage
  entityId: string
  projectId: string
  clientName: string
  bankAccountId: string
  /** Category id for `inflows_revenue_tracker` — where confirmed pipeline revenue lands. */
  revenueTrackerCategoryId: string
  /** Category id for `outflows_ap_third_party` — where third-party supplier costs land. */
  thirdPartyCategoryId?: string | null
  /**
   * Portion of the project's `third_party_costs` attributable to this allocation.
   * Should be scaled by the caller (e.g. `thirdPartyCosts * allocation.amount / totalBillingAmount`).
   * When 0, null, or undefined, no third-party lines are emitted.
   */
  thirdPartyAmount?: number | null
  weekEndings: string[]
  periodMap: Record<string, string>
}

export interface SyncedForecastLine {
  entityId: string
  categoryId: string
  periodId: string
  bankAccountId: string
  amount: number
  confidence: number
  source: 'pipeline'
  sourcePipelineProjectId: string
  counterparty: string
  lineStatus: string
}

/**
 * Compute the forecast lines produced by syncing a single pipeline allocation.
 *
 * Confirmed-only: only projects with `stage = 'confirmed'` produce lines. All
 * other stages return an empty array (the caller is expected to delete any
 * previously-synced lines separately — the engine does not know about them).
 *
 * Revenue lines target `inflows_revenue_tracker` (positive amounts).
 * Third-party cost lines (when `thirdPartyAmount > 0` and `thirdPartyCategoryId`
 * is provided) target `outflows_ap_third_party` with the same weekly
 * distribution as the revenue line, but with **negative** amounts.
 */
export function computeSyncLines(input: SyncLineInput): SyncedForecastLine[] {
  const {
    allocation,
    stage,
    entityId,
    projectId,
    clientName,
    bankAccountId,
    revenueTrackerCategoryId,
    thirdPartyCategoryId,
    thirdPartyAmount,
    weekEndings,
    periodMap,
  } = input

  // Confirmed-only: speculative / awaiting_approval / upcoming / declined produce nothing.
  if (stage !== 'confirmed') return []
  if (weekEndings.length === 0) return []

  const confidence = 100
  const lineStatus = 'confirmed'
  const baseShared = {
    entityId,
    bankAccountId,
    confidence,
    source: 'pipeline' as const,
    sourcePipelineProjectId: projectId,
    counterparty: clientName,
    lineStatus,
  }

  const revenueBase = { ...baseShared, categoryId: revenueTrackerCategoryId }
  const emitThirdParty =
    thirdPartyCategoryId != null &&
    thirdPartyAmount != null &&
    thirdPartyAmount !== 0
  const thirdPartyBase = emitThirdParty
    ? { ...baseShared, categoryId: thirdPartyCategoryId! }
    : null

  const revenueLines: SyncedForecastLine[] = []
  const thirdPartyLines: SyncedForecastLine[] = []

  switch (allocation.distribution) {
    case 'first_week': {
      const periodId = periodMap[weekEndings[0]]
      if (!periodId) return []
      revenueLines.push({ ...revenueBase, periodId, amount: allocation.amount })
      if (thirdPartyBase) {
        thirdPartyLines.push({
          ...thirdPartyBase,
          periodId,
          amount: -Math.abs(thirdPartyAmount!),
        })
      }
      break
    }
    case 'last_week': {
      const last = weekEndings[weekEndings.length - 1]
      const periodId = periodMap[last]
      if (!periodId) return []
      revenueLines.push({ ...revenueBase, periodId, amount: allocation.amount })
      if (thirdPartyBase) {
        thirdPartyLines.push({
          ...thirdPartyBase,
          periodId,
          amount: -Math.abs(thirdPartyAmount!),
        })
      }
      break
    }
    case 'even':
    default: {
      const count = weekEndings.length
      const perWeek = Math.floor(allocation.amount / count)
      const remainder = allocation.amount - perWeek * count

      // Third-party is allocated with the same floor+remainder pattern so both
      // line sets share identical weekly weights.
      const tpTotal = emitThirdParty ? Math.abs(thirdPartyAmount!) : 0
      const tpPerWeek = emitThirdParty ? Math.floor(tpTotal / count) : 0
      const tpRemainder = emitThirdParty ? tpTotal - tpPerWeek * count : 0

      for (let i = 0; i < count; i++) {
        const we = weekEndings[i]
        const periodId = periodMap[we]
        if (!periodId) continue
        const isLast = i === count - 1
        const amount = isLast ? perWeek + remainder : perWeek
        revenueLines.push({ ...revenueBase, periodId, amount })
        if (thirdPartyBase) {
          const tpAmount = isLast ? tpPerWeek + tpRemainder : tpPerWeek
          thirdPartyLines.push({
            ...thirdPartyBase,
            periodId,
            amount: -tpAmount,
          })
        }
      }
      break
    }
  }

  return [...revenueLines, ...thirdPartyLines]
}

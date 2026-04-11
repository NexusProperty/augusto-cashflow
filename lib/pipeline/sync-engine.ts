import type { PipelineStage } from '@/lib/types'
import type { PipelineAllocation } from './types'
import { STAGE_CONFIDENCE, STAGE_LINE_STATUS } from './types'

export interface SyncLineInput {
  allocation: PipelineAllocation
  stage: PipelineStage
  entityId: string
  projectId: string
  clientName: string
  bankAccountId: string
  arCategoryId: string
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

export function computeSyncLines(input: SyncLineInput): SyncedForecastLine[] {
  const {
    allocation,
    stage,
    entityId,
    projectId,
    clientName,
    bankAccountId,
    arCategoryId,
    weekEndings,
    periodMap,
  } = input

  if (stage === 'declined') return []
  if (weekEndings.length === 0) return []

  const confidence = STAGE_CONFIDENCE[stage]
  const lineStatus = STAGE_LINE_STATUS[stage]
  const base = {
    entityId,
    categoryId: arCategoryId,
    bankAccountId,
    confidence,
    source: 'pipeline' as const,
    sourcePipelineProjectId: projectId,
    counterparty: clientName,
    lineStatus,
  }

  switch (allocation.distribution) {
    case 'first_week': {
      const periodId = periodMap[weekEndings[0]]
      if (!periodId) return []
      return [{ ...base, periodId, amount: allocation.amount }]
    }
    case 'last_week': {
      const last = weekEndings[weekEndings.length - 1]
      const periodId = periodMap[last]
      if (!periodId) return []
      return [{ ...base, periodId, amount: allocation.amount }]
    }
    case 'even':
    default: {
      const count = weekEndings.length
      const perWeek = Math.floor(allocation.amount / count)
      const remainder = allocation.amount - perWeek * count

      return weekEndings
        .map((we, i) => {
          const periodId = periodMap[we]
          if (!periodId) return null
          const amount = i === count - 1 ? perWeek + remainder : perWeek
          return { ...base, periodId, amount }
        })
        .filter((l): l is SyncedForecastLine => l !== null)
    }
  }
}

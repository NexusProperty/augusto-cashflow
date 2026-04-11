import type { PipelineStage } from '@/lib/types'

export interface PipelineClient {
  id: string
  entityId: string
  name: string
  isActive: boolean
  notes: string | null
}

export interface PipelineProject {
  id: string
  clientId: string
  entityId: string
  jobNumber: string | null
  projectName: string
  taskEstimate: string | null
  stage: PipelineStage
  teamMember: string | null
  billingAmount: number | null
  thirdPartyCosts: number | null
  grossProfit: number | null
  invoiceDate: string | null
  notes: string | null
  isSynced: boolean
  createdBy: string | null
}

export interface PipelineAllocation {
  id: string
  projectId: string
  month: string
  amount: number
  distribution: DistributionRule
}

export type DistributionRule = 'even' | 'first_week' | 'last_week' | 'custom'

export interface RevenueTarget {
  id: string
  entityId: string
  month: string
  targetAmount: number
}

export const STAGE_CONFIDENCE: Record<PipelineStage, number> = {
  confirmed: 100,
  awaiting_approval: 80,
  upcoming: 50,
  speculative: 20,
  declined: 0,
}

export const STAGE_LINE_STATUS: Record<PipelineStage, string> = {
  confirmed: 'confirmed',
  awaiting_approval: 'awaiting_budget_approval',
  upcoming: 'tbc',
  speculative: 'speculative',
  declined: 'none',
}

export const STAGE_DISPLAY: Record<PipelineStage, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: 'emerald' },
  awaiting_approval: { label: 'Awaiting Approval', color: 'amber' },
  upcoming: { label: 'Upcoming', color: 'sky' },
  speculative: { label: 'Speculative', color: 'rose' },
  declined: { label: 'Declined', color: 'zinc' },
}

export const PNL_WEIGHT: Record<PipelineStage, number> = {
  confirmed: 1.0,
  awaiting_approval: 0.5,
  upcoming: 0.5,
  speculative: 0.5,
  declined: 0,
}

export interface PipelineProjectRow extends PipelineProject {
  clientName: string
  allocations: PipelineAllocation[]
  totalAmount: number
}

export interface BUSummaryRow {
  entityId: string
  entityName: string
  confirmedAndAwaiting: number[]
  upcomingAndSpeculative: number[]
  totalForecast: number[]
  target: number[]
  variance: number[]
  pnlForecast: number[]
}

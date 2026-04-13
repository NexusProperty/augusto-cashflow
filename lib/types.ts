// Seed data UUIDs — single source of truth
export const AUGUSTO_GROUP_ID = 'a0000000-0000-0000-0000-000000000001'
export const COACHMATE_GROUP_ID = 'a0000000-0000-0000-0000-000000000002'

export type SourceType = 'manual' | 'document' | 'recurring' | 'pipeline'
export type LineStatus = 'none' | 'confirmed' | 'tbc' | 'awaiting_payment' | 'paid' | 'remittance_received' | 'speculative' | 'awaiting_budget_approval'
export type PipelineStage = 'confirmed' | 'awaiting_approval' | 'upcoming' | 'speculative' | 'declined'
export type FlowDirection = 'inflow' | 'outflow' | 'balance' | 'computed'

export interface ForecastLine {
  id: string
  entityId: string
  categoryId: string
  periodId: string
  amount: number
  confidence: number
  source: SourceType
  counterparty: string | null
  notes: string | null
  sourceDocumentId: string | null
  sourceRuleId: string | null
  sourcePipelineProjectId: string | null
  lineStatus: LineStatus
  /** Formula expression (e.g. =SUM(W1:W4)). Null = plain amount. */
  formula: string | null
  /** Bank account this line flows through. Null = unrouted (pre-migration-024). */
  bankAccountId?: string | null
}

export interface BankAccount {
  id: string
  entityId: string
  name: string
  accountType: string | null
  accountNumber: string | null
  odLimit: number
  openingBalance: number
  isActive: boolean
  notes: string | null
}

export interface BankBalance {
  bankAccountId: string
  bankName: string
  openingBalance: number
  netCashFlow: number
  closingBalance: number
}

export type OverrideTargetType = 'pipeline_item' | 'recurring_rule'

export interface ScenarioOverride {
  id: string
  scenarioId: string
  targetType: OverrideTargetType
  targetId: string
  overrideConfidence: number | null
  overrideAmount: number | null
  overrideWeekShift: number
  isExcluded: boolean
}

export interface Period {
  id: string
  weekEnding: string
  isActual: boolean
}

export interface Category {
  id: string
  parentId: string | null
  name: string
  code: string
  sectionNumber: string | null
  sortOrder: number
  flowDirection: FlowDirection
}

export interface EntityGroup {
  id: string
  name: string
  odFacilityLimit: number
}

export interface WeekSummary {
  periodId: string
  weekEnding: string
  openingBalance: number
  totalInflows: number
  totalOutflows: number
  netOperating: number
  loansAndFinancing: number
  closingBalance: number
  availableCash: number
  isOverdrawn: boolean
  /** Per-bank breakdown, ordered to match MAIN_FORECAST_BANK_NAMES. Empty if engine called without bankAccounts. */
  byBank: BankBalance[]
}

export interface ForecastAlert {
  type: 'od_breach' | 'cash_cliff' | 'material_change'
  periodId: string
  message: string
  severity: 'warning' | 'danger'
  lineId?: string
}

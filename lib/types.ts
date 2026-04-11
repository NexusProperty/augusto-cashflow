// Seed data UUIDs — single source of truth
export const AUGUSTO_GROUP_ID = 'a0000000-0000-0000-0000-000000000001'
export const COACHMATE_GROUP_ID = 'a0000000-0000-0000-0000-000000000002'

export type SourceType = 'manual' | 'document' | 'recurring' | 'pipeline'
export type LineStatus = 'none' | 'confirmed' | 'tbc' | 'awaiting_payment' | 'paid' | 'remittance_received' | 'speculative' | 'awaiting_budget_approval'
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
  lineStatus: LineStatus
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
}

export interface ForecastAlert {
  type: 'od_breach' | 'cash_cliff' | 'material_change'
  periodId: string
  message: string
  severity: 'warning' | 'danger'
  lineId?: string
}

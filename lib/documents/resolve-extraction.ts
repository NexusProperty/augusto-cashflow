import type { ReferenceData } from './reference-data'

const VALID_STATUSES = new Set([
  'none', 'confirmed', 'tbc', 'awaiting_payment', 'paid',
  'remittance_received', 'speculative', 'awaiting_budget_approval',
])

export interface ResolvedExtraction {
  entityId: string | null
  bankAccountId: string | null
  categoryId: string | null
  periodId: string | null
  status: string | null
}

interface AIExtractionFields {
  entityCode: string | null
  bankAccountNumber: string | null
  categoryCode: string | null
  suggestedWeekEnding: string | null
  suggestedStatus: string | null
}

export function resolveExtraction(
  ai: AIExtractionFields,
  ref: ReferenceData,
): ResolvedExtraction {
  // Entity: case-insensitive name match
  const entityId = ai.entityCode
    ? ref.entities.find(e => e.name.toLowerCase() === ai.entityCode!.toLowerCase())?.id ?? null
    : null

  // Bank account: exact account number match
  const bankAccountId = ai.bankAccountNumber
    ? ref.bankAccounts.find(ba => ba.account_number === ai.bankAccountNumber)?.id ?? null
    : null

  // Category: exact code match
  const categoryId = ai.categoryCode
    ? ref.categories.find(c => c.code === ai.categoryCode)?.id ?? null
    : null

  // Period: find the week that contains the suggested date
  let periodId: string | null = null
  if (ai.suggestedWeekEnding && ref.periods.length > 0) {
    const target = new Date(ai.suggestedWeekEnding + 'T00:00:00')
    // Find the first period where week_ending >= target date
    const match = ref.periods.find(p => {
      const weekEnd = new Date(p.week_ending + 'T00:00:00')
      const weekStart = new Date(weekEnd)
      weekStart.setDate(weekStart.getDate() - 6)
      return target >= weekStart && target <= weekEnd
    })
    periodId = match?.id ?? null
  }

  // Status: validate against known values
  const status = ai.suggestedStatus && VALID_STATUSES.has(ai.suggestedStatus)
    ? ai.suggestedStatus
    : null

  return { entityId, bankAccountId, categoryId, periodId, status }
}

export function isFullyResolved(r: ResolvedExtraction): boolean {
  return r.entityId !== null
    && r.bankAccountId !== null
    && r.categoryId !== null
    && r.periodId !== null
    && r.status !== null
}

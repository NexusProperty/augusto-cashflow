import { describe, it, expect } from 'vitest'
import {
  resolveExtraction,
  isFullyResolved,
  type ResolvedExtraction,
} from '@/lib/documents/resolve-extraction'
import type { ReferenceData } from '@/lib/documents/reference-data'

const refData: ReferenceData = {
  entities: [
    { id: 'e1', name: 'Augusto' },
    { id: 'e2', name: 'Cornerstore' },
  ],
  bankAccounts: [
    { id: 'ba1', name: 'Augusto Current', account_number: '02-0108-0436455-000', entity_id: 'e1', entities: { name: 'Augusto' } },
    { id: 'ba2', name: 'Cornerstore Current', account_number: '02-0108-0436551-000', entity_id: 'e2', entities: { name: 'Cornerstore' } },
  ],
  categories: [
    { id: 'c1', name: 'Accounts Receivable', code: 'inflows_ar', flow_direction: 'inflow' },
    { id: 'c2', name: 'Accounts Payable', code: 'outflows_ap', flow_direction: 'outflow' },
  ],
  periods: [
    { id: 'p1', week_ending: '2026-04-10' },
    { id: 'p2', week_ending: '2026-04-17' },
    { id: 'p3', week_ending: '2026-04-24' },
  ],
}

describe('resolveExtraction', () => {
  it('resolves all fields when AI output matches reference data', () => {
    const result = resolveExtraction({
      entityCode: 'cornerstore',
      bankAccountNumber: '02-0108-0436551-000',
      categoryCode: 'outflows_ap',
      suggestedWeekEnding: '2026-04-17',
      suggestedStatus: 'awaiting_payment',
    }, refData)

    expect(result.entityId).toBe('e2')
    expect(result.bankAccountId).toBe('ba2')
    expect(result.categoryId).toBe('c2')
    expect(result.periodId).toBe('p2')
    expect(result.status).toBe('awaiting_payment')
  })

  it('matches entity name case-insensitively', () => {
    const result = resolveExtraction({
      entityCode: 'AUGUSTO',
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: null,
      suggestedStatus: null,
    }, refData)

    expect(result.entityId).toBe('e1')
  })

  it('returns null for unmatched fields', () => {
    const result = resolveExtraction({
      entityCode: 'nonexistent',
      bankAccountNumber: '99-9999-9999999-000',
      categoryCode: 'unknown_category',
      suggestedWeekEnding: '2099-01-01',
      suggestedStatus: 'awaiting_payment',
    }, refData)

    expect(result.entityId).toBeNull()
    expect(result.bankAccountId).toBeNull()
    expect(result.categoryId).toBeNull()
    expect(result.periodId).toBeNull()
    expect(result.status).toBe('awaiting_payment')
  })

  it('matches period to closest week ending when exact match absent', () => {
    const result = resolveExtraction({
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: '2026-04-12',
      suggestedStatus: null,
    }, refData)

    // 2026-04-12 falls in the week ending 2026-04-17
    expect(result.periodId).toBe('p2')
  })

  it('returns all nulls when AI fields are all null', () => {
    const result = resolveExtraction({
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: null,
      suggestedStatus: null,
    }, refData)

    expect(result.entityId).toBeNull()
    expect(result.bankAccountId).toBeNull()
    expect(result.categoryId).toBeNull()
    expect(result.periodId).toBeNull()
    expect(result.status).toBeNull()
  })

  it('rejects invalid status values', () => {
    const result = resolveExtraction({
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: null,
      suggestedStatus: 'invalid_status',
    }, refData)

    expect(result.status).toBeNull()
  })
})

describe('isFullyResolved', () => {
  it('returns true when all fields are non-null', () => {
    const resolved: ResolvedExtraction = {
      entityId: 'e1',
      bankAccountId: 'ba1',
      categoryId: 'c1',
      periodId: 'p1',
      status: 'confirmed',
    }
    expect(isFullyResolved(resolved)).toBe(true)
  })

  it('returns false when any field is null', () => {
    const partial: ResolvedExtraction = {
      entityId: 'e1',
      bankAccountId: 'ba1',
      categoryId: null,
      periodId: 'p1',
      status: 'confirmed',
    }
    expect(isFullyResolved(partial)).toBe(false)
  })

  it('returns false when status is null', () => {
    const noStatus: ResolvedExtraction = {
      entityId: 'e1',
      bankAccountId: 'ba1',
      categoryId: 'c1',
      periodId: 'p1',
      status: null,
    }
    expect(isFullyResolved(noStatus)).toBe(false)
  })
})

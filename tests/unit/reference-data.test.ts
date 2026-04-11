import { describe, it, expect } from 'vitest'
import { formatReferenceDataForPrompt } from '@/lib/documents/reference-data'

describe('formatReferenceDataForPrompt', () => {
  it('formats entities as a numbered list', () => {
    const entities = [
      { id: 'e1', name: 'Augusto' },
      { id: 'e2', name: 'Cornerstore' },
    ]
    const result = formatReferenceDataForPrompt({
      entities,
      bankAccounts: [],
      categories: [],
      periods: [],
    })

    expect(result).toContain('ENTITIES:')
    expect(result).toContain('- augusto')
    expect(result).toContain('- cornerstore')
  })

  it('formats bank accounts with entity and account number', () => {
    const bankAccounts = [
      { id: 'ba1', name: 'Augusto Current', account_number: '02-0108-0436455-000', entity_id: 'e1', entities: { name: 'Augusto' } },
    ]
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts,
      categories: [],
      periods: [],
    })

    expect(result).toContain('BANK ACCOUNTS:')
    expect(result).toContain('02-0108-0436455-000')
    expect(result).toContain('Augusto Current')
    expect(result).toContain('Augusto')
  })

  it('formats leaf categories with code and flow direction', () => {
    const categories = [
      { id: 'c1', name: 'Accounts Receivable', code: 'inflows_ar', flow_direction: 'inflow' },
      { id: 'c2', name: 'Accounts Payable', code: 'outflows_ap', flow_direction: 'outflow' },
    ]
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts: [],
      categories,
      periods: [],
    })

    expect(result).toContain('CATEGORIES:')
    expect(result).toContain('inflows_ar')
    expect(result).toContain('outflows_ap')
    expect(result).toContain('inflow')
  })

  it('formats periods as week ending dates', () => {
    const periods = [
      { id: 'p1', week_ending: '2026-04-10' },
      { id: 'p2', week_ending: '2026-04-17' },
    ]
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts: [],
      categories: [],
      periods,
    })

    expect(result).toContain('FORECAST PERIODS:')
    expect(result).toContain('2026-04-10')
    expect(result).toContain('2026-04-17')
  })

  it('returns empty sections gracefully for empty arrays', () => {
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts: [],
      categories: [],
      periods: [],
    })

    expect(result).toContain('ENTITIES:')
    expect(result).toContain('BANK ACCOUNTS:')
    expect(result).toContain('CATEGORIES:')
    expect(result).toContain('FORECAST PERIODS:')
  })
})

import { describe, it, expect } from 'vitest'
import { generateRecurringLines } from '@/lib/forecast/recurring'
import type { Period } from '@/lib/types'

const periods: Period[] = [
  { id: 'p1', weekEnding: '2026-03-27', isActual: false },
  { id: 'p2', weekEnding: '2026-04-03', isActual: false },
  { id: 'p3', weekEnding: '2026-04-10', isActual: false },
  { id: 'p4', weekEnding: '2026-04-17', isActual: false },
  { id: 'p5', weekEnding: '2026-04-24', isActual: false },
]

describe('generateRecurringLines', () => {
  it('generates fortnightly lines from anchor date', () => {
    const rule = {
      id: 'r1',
      entityId: 'e1',
      categoryId: 'outflows_payroll',
      description: 'AUG Payroll',
      amount: -55000,
      frequency: 'fortnightly' as const,
      anchorDate: '2026-04-10',
      dayOfMonth: null,
      endDate: null,
      isActive: true,
      counterparty: null,
    }

    const result = generateRecurringLines(rule, periods)

    // Anchor 10 Apr → hits p3 (w/e 10 Apr), then +14d = 24 Apr → hits p5 (w/e 24 Apr)
    expect(result).toHaveLength(2)
    expect(result[0].periodId).toBe('p3')
    expect(result[0].amount).toBe(-55000)
    expect(result[1].periodId).toBe('p5')
  })

  it('generates monthly lines on day_of_month', () => {
    const rule = {
      id: 'r2',
      entityId: 'e1',
      categoryId: 'outflows_rent',
      description: 'Rent',
      amount: -27000,
      frequency: 'monthly' as const,
      anchorDate: '2026-03-23',
      dayOfMonth: 23,
      endDate: null,
      isActive: true,
      counterparty: null,
    }

    // March 23 falls in w/e 27 Mar (p1), April 23 falls in w/e 24 Apr (p5)
    const result = generateRecurringLines(rule, periods)

    expect(result).toHaveLength(2)
    expect(result[0].periodId).toBe('p1')
    expect(result[1].periodId).toBe('p5')
  })

  it('respects end_date', () => {
    const rule = {
      id: 'r3',
      entityId: 'e1',
      categoryId: 'loans',
      description: 'Loan',
      amount: -17000,
      frequency: 'monthly' as const,
      anchorDate: '2026-03-27',
      dayOfMonth: 27,
      endDate: '2026-04-10',
      isActive: true,
      counterparty: null,
    }

    const result = generateRecurringLines(rule, periods)

    expect(result).toHaveLength(1) // only March
  })

  it('skips inactive rules', () => {
    const rule = {
      id: 'r4',
      entityId: 'e1',
      categoryId: 'outflows_payroll',
      description: 'Inactive',
      amount: -10000,
      frequency: 'weekly' as const,
      anchorDate: '2026-03-27',
      dayOfMonth: null,
      endDate: null,
      isActive: false,
      counterparty: null,
    }

    const result = generateRecurringLines(rule, periods)
    expect(result).toHaveLength(0)
  })
})

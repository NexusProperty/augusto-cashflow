import { describe, it, expect } from 'vitest'
import {
  getFiscalYear,
  getFiscalYearMonths,
  getWeeksInMonth,
} from '@/lib/pipeline/fiscal-year'

describe('getFiscalYear', () => {
  it('returns FY2027 for dates in Apr 2026 - Mar 2027 (start=4)', () => {
    expect(getFiscalYear(new Date('2026-04-15'), 4)).toBe(2027)
    expect(getFiscalYear(new Date('2027-03-31'), 4)).toBe(2027)
  })

  it('returns FY2027 for April 1 2026 (boundary)', () => {
    expect(getFiscalYear(new Date('2026-04-01'), 4)).toBe(2027)
  })

  it('returns FY2026 for March 31 2026 (before boundary)', () => {
    expect(getFiscalYear(new Date('2026-03-31'), 4)).toBe(2026)
  })
})

describe('getFiscalYearMonths', () => {
  it('returns 12 month-start dates for FY2027 (Apr start)', () => {
    const months = getFiscalYearMonths(2027, 4)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-04-01')
    expect(months[1]).toBe('2026-05-01')
    expect(months[11]).toBe('2027-03-01')
  })
})

describe('getWeeksInMonth', () => {
  it('returns week_ending dates that fall in April 2026', () => {
    const allWeeks = [
      '2026-03-27', '2026-04-03', '2026-04-10', '2026-04-17',
      '2026-04-24', '2026-05-01', '2026-05-08',
    ]
    const result = getWeeksInMonth(allWeeks, '2026-04-01')
    expect(result).toEqual(['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24'])
  })

  it('returns empty array when no weeks fall in month', () => {
    const allWeeks = ['2026-03-27', '2026-05-01']
    const result = getWeeksInMonth(allWeeks, '2026-04-01')
    expect(result).toEqual([])
  })
})

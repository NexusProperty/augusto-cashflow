import { describe, it, expect } from 'vitest'
import { detectAlerts } from '@/lib/forecast/alerts'
import type { WeekSummary, ForecastLine } from '@/lib/types'

const summary = (periodId: string, overrides: Partial<WeekSummary> = {}): WeekSummary => ({
  periodId,
  weekEnding: '2026-03-27',
  openingBalance: 0,
  totalInflows: 0,
  totalOutflows: 0,
  netOperating: 0,
  loansAndFinancing: 0,
  closingBalance: 0,
  availableCash: 0,
  isOverdrawn: false,
  ...overrides,
})

describe('detectAlerts', () => {
  it('flags OD breach when overdrawn', () => {
    const summaries = [summary('p1', { isOverdrawn: true, availableCash: -100000, closingBalance: -1000000 })]
    const alerts = detectAlerts(summaries, [])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('od_breach')
    expect(alerts[0].severity).toBe('danger')
  })

  it('flags cash cliff for large single outflows', () => {
    const summaries = [summary('p1', { closingBalance: -500000 })]
    const lines: ForecastLine[] = [{
      id: 'l1', entityId: 'e1', categoryId: 'loans', periodId: 'p1',
      amount: -900000, confidence: 100, source: 'manual',
      counterparty: 'Trade Finance', notes: null,
      sourceDocumentId: null, sourceRuleId: null,
    }]
    const alerts = detectAlerts(summaries, lines)
    const cliffAlert = alerts.find((a) => a.type === 'cash_cliff')
    expect(cliffAlert).toBeDefined()
    expect(cliffAlert!.severity).toBe('danger')
  })

  it('returns no alerts when position is healthy', () => {
    const summaries = [summary('p1', { availableCash: 500000, closingBalance: 100000 })]
    const alerts = detectAlerts(summaries, [])
    expect(alerts).toHaveLength(0)
  })
})

import type { ForecastLine, Period } from '@/lib/types'

export interface RecurringRule {
  id: string
  entityId: string
  categoryId: string
  description: string
  amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly'
  anchorDate: string
  dayOfMonth: number | null
  endDate: string | null
  isActive: boolean
  counterparty: string | null
}

export function generateRecurringLines(
  rule: RecurringRule,
  periods: Period[],
): Omit<ForecastLine, 'id'>[] {
  if (!rule.isActive) return []

  const occurrences = computeOccurrences(rule, periods)
  const sortedPeriods = [...periods].sort(
    (a, b) => new Date(a.weekEnding).getTime() - new Date(b.weekEnding).getTime()
  )

  const results: Omit<ForecastLine, 'id'>[] = []
  for (const date of occurrences) {
    const period = findPeriodForDate(date, sortedPeriods)
    if (!period) continue
    results.push({
      entityId: rule.entityId,
      categoryId: rule.categoryId,
      periodId: period.id,
      amount: rule.amount,
      confidence: 100,
      source: 'recurring' as const,
      counterparty: rule.counterparty,
      notes: rule.description,
      sourceDocumentId: null,
      sourceRuleId: rule.id,
    })
  }
  return results
}

function computeOccurrences(rule: RecurringRule, periods: Period[]): Date[] {
  const sortedPeriods = [...periods].sort(
    (a, b) => new Date(a.weekEnding).getTime() - new Date(b.weekEnding).getTime()
  )

  const windowEnd = new Date(sortedPeriods[sortedPeriods.length - 1].weekEnding)
  const windowStart = new Date(sortedPeriods[0].weekEnding)
  windowStart.setDate(windowStart.getDate() - 6)

  const endDate = rule.endDate ? new Date(rule.endDate) : null
  const anchor = new Date(rule.anchorDate)

  // If anchor is after window end, no occurrences possible in this window
  if (anchor > windowEnd) return []

  const occurrences: Date[] = []

  // Step forward from anchor, collecting occurrences within the window
  let current = new Date(anchor)

  while (current <= windowEnd) {
    if (current >= windowStart) {
      if (endDate && current > endDate) break
      occurrences.push(new Date(current))
    }
    const next = nextOccurrence(current, rule)
    if (next.getTime() === current.getTime()) break // safety
    current = next
  }

  return occurrences
}

function nextOccurrence(current: Date, rule: RecurringRule): Date {
  const next = new Date(current)
  switch (rule.frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'fortnightly':
      next.setDate(next.getDate() + 14)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      if (rule.dayOfMonth) {
        next.setDate(Math.min(rule.dayOfMonth, daysInMonth(next)))
      }
      break
  }
  return next
}

function findPeriodForDate(date: Date, sortedPeriods: Period[]): Period | null {
  for (const period of sortedPeriods) {
    const weekEnd = new Date(period.weekEnding)
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekStart.getDate() - 6)

    if (date >= weekStart && date <= weekEnd) {
      return period
    }
  }
  return null
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

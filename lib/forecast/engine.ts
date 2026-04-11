import type { ForecastLine, Period, Category, WeekSummary } from '@/lib/types'

export function applyConfidenceWeighting(amount: number, confidence: number): number {
  return Math.round(amount * (confidence / 100))
}

function getFlowDirection(categoryId: string, categories: Category[]): string {
  const cat = categories.find((c) => c.id === categoryId)
  if (!cat) return 'inflow'
  if (cat.flowDirection && cat.flowDirection !== 'computed') return cat.flowDirection
  if (cat.parentId) return getFlowDirection(cat.parentId, categories)
  return 'inflow'
}

function isLoansCategory(categoryId: string, categories: Category[]): boolean {
  const cat = categories.find((c) => c.id === categoryId)
  if (!cat) return false
  if (cat.code === 'loans') return true
  if (cat.parentId) return isLoansCategory(cat.parentId, categories)
  return false
}

export function computeWeekSummaries(
  periods: Period[],
  lines: ForecastLine[],
  categories: Category[],
  odFacilityLimit: number,
  weighted: boolean,
): WeekSummary[] {
  const sorted = [...periods].sort(
    (a, b) => new Date(a.weekEnding).getTime() - new Date(b.weekEnding).getTime()
  )

  const linesByPeriod = new Map<string, ForecastLine[]>()
  for (const line of lines) {
    const existing = linesByPeriod.get(line.periodId) ?? []
    existing.push(line)
    linesByPeriod.set(line.periodId, existing)
  }

  const summaries: WeekSummary[] = []
  let previousClosing = 0

  for (const period of sorted) {
    const periodLines = linesByPeriod.get(period.id) ?? []

    let openingBalance = 0
    let totalInflows = 0
    let totalOutflows = 0
    let loansAndFinancing = 0

    for (const line of periodLines) {
      const direction = getFlowDirection(line.categoryId, categories)
      const amount = weighted ? applyConfidenceWeighting(line.amount, line.confidence) : line.amount

      switch (direction) {
        case 'balance':
          openingBalance += amount
          break
        case 'inflow':
          totalInflows += amount
          break
        case 'outflow':
          if (isLoansCategory(line.categoryId, categories)) {
            loansAndFinancing += amount
          } else {
            totalOutflows += amount
          }
          break
      }
    }

    const hasOpeningLines = periodLines.some(
      (l) => getFlowDirection(l.categoryId, categories) === 'balance'
    )
    if (!hasOpeningLines && summaries.length > 0) {
      openingBalance = previousClosing
    }

    const netOperating = totalInflows + totalOutflows
    const closingBalance = openingBalance + netOperating + loansAndFinancing
    const availableCash = closingBalance + odFacilityLimit

    const summary: WeekSummary = {
      periodId: period.id,
      weekEnding: period.weekEnding,
      openingBalance,
      totalInflows,
      totalOutflows,
      netOperating,
      loansAndFinancing,
      closingBalance,
      availableCash,
      isOverdrawn: availableCash < 0,
    }

    summaries.push(summary)
    previousClosing = closingBalance
  }

  return summaries
}

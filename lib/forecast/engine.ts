import type { ForecastLine, Period, Category, WeekSummary, ScenarioOverride } from '@/lib/types'

export function applyConfidenceWeighting(amount: number, confidence: number): number {
  return Math.round(amount * (confidence / 100))
}

export interface ApplyOverridesResult {
  lines: ForecastLine[]
  overriddenIds: Set<string>
  confidenceOverriddenIds: Set<string>
}

export function applyScenarioOverrides(
  lines: ForecastLine[],
  overrides: ScenarioOverride[],
  periods: Period[],
): ApplyOverridesResult {
  if (overrides.length === 0) {
    return { lines, overriddenIds: new Set(), confidenceOverriddenIds: new Set() }
  }

  const pipelineOverrides = new Map<string, ScenarioOverride>()
  const recurringOverrides = new Map<string, ScenarioOverride>()
  for (const o of overrides) {
    if (o.targetType === 'pipeline_item') pipelineOverrides.set(o.targetId, o)
    else if (o.targetType === 'recurring_rule') recurringOverrides.set(o.targetId, o)
  }

  const sortedPeriods = [...periods].sort(
    (a, b) => new Date(a.weekEnding).getTime() - new Date(b.weekEnding).getTime()
  )
  const periodIndex = new Map(sortedPeriods.map((p, i) => [p.id, i]))

  const overriddenIds = new Set<string>()
  const confidenceOverriddenIds = new Set<string>()

  const result: ForecastLine[] = []
  for (const line of lines) {
    const override =
      (line.sourcePipelineProjectId && pipelineOverrides.get(line.sourcePipelineProjectId)) ||
      (line.sourceRuleId && recurringOverrides.get(line.sourceRuleId)) ||
      null

    if (!override) {
      result.push(line)
      continue
    }

    if (override.isExcluded) {
      overriddenIds.add(line.id)
      continue
    }

    let nextLine: ForecastLine = { ...line }

    if (override.overrideAmount !== null) {
      nextLine.amount = override.overrideAmount
    }
    if (override.overrideConfidence !== null) {
      nextLine.confidence = override.overrideConfidence
      confidenceOverriddenIds.add(line.id)
    }
    if (override.overrideWeekShift && override.overrideWeekShift !== 0) {
      const idx = periodIndex.get(line.periodId)
      if (idx !== undefined) {
        const targetIdx = idx + override.overrideWeekShift
        if (targetIdx >= 0 && targetIdx < sortedPeriods.length) {
          nextLine.periodId = sortedPeriods[targetIdx].id
        } else {
          // shifted out of window — drop
          overriddenIds.add(line.id)
          continue
        }
      }
    }

    overriddenIds.add(line.id)
    result.push(nextLine)
  }

  return { lines: result, overriddenIds, confidenceOverriddenIds }
}

function getFlowDirection(categoryId: string, categoryMap: Map<string, Category>): string {
  const cat = categoryMap.get(categoryId)
  if (!cat) return 'inflow'
  if (cat.flowDirection && cat.flowDirection !== 'computed') return cat.flowDirection
  if (cat.parentId) return getFlowDirection(cat.parentId, categoryMap)
  return 'inflow'
}

function isLoansCategory(categoryId: string, categoryMap: Map<string, Category>): boolean {
  const cat = categoryMap.get(categoryId)
  if (!cat) return false
  if (cat.code === 'loans') return true
  if (cat.parentId) return isLoansCategory(cat.parentId, categoryMap)
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

  // Index categories once instead of Array.find per line × per period.
  const categoryMap = new Map<string, Category>()
  for (const c of categories) categoryMap.set(c.id, c)

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
      const direction = getFlowDirection(line.categoryId, categoryMap)
      const amount = weighted ? applyConfidenceWeighting(line.amount, line.confidence) : line.amount

      switch (direction) {
        case 'balance':
          openingBalance += amount
          break
        case 'inflow':
          totalInflows += amount
          break
        case 'outflow':
          if (isLoansCategory(line.categoryId, categoryMap)) {
            loansAndFinancing += amount
          } else {
            totalOutflows += amount
          }
          break
      }
    }

    const hasOpeningLines = periodLines.some(
      (l) => getFlowDirection(l.categoryId, categoryMap) === 'balance'
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

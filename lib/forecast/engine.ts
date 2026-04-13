import type {
  ForecastLine,
  Period,
  Category,
  WeekSummary,
  ScenarioOverride,
  BankAccount,
  BankBalance,
} from '@/lib/types'
import { MAIN_FORECAST_BANK_NAMES, DEFAULT_BANK_NAME } from '@/lib/forecast/constants'

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
  bankAccounts?: BankAccount[],
): WeekSummary[] {
  const sorted = [...periods].sort(
    (a, b) => new Date(a.weekEnding).getTime() - new Date(b.weekEnding).getTime()
  )

  // Index categories once instead of Array.find per line × per period.
  const categoryMap = new Map<string, Category>()
  for (const c of categories) categoryMap.set(c.id, c)

  // Resolve per-bank mode. Only kicks in when caller passes bankAccounts.
  // In per-bank mode we restrict everything on this view (including
  // direction-based totals) to the 4 main banks — Coachmate and any other
  // tagged-but-not-main lines are silently excluded so that
  // closingBalance = openingBalance + netOperating + loansAndFinancing holds.
  const perBankMode = Array.isArray(bankAccounts) && bankAccounts.length > 0

  // Main banks in render order, filtered to only those present + active.
  const mainBanks: BankAccount[] = perBankMode
    ? MAIN_FORECAST_BANK_NAMES.map((name) =>
        bankAccounts!.find((b) => b.name === name && b.isActive !== false)
      ).filter((b): b is BankAccount => Boolean(b))
    : []
  const mainBankIds = new Set(mainBanks.map((b) => b.id))
  const defaultBankId = perBankMode
    ? mainBanks.find((b) => b.name === DEFAULT_BANK_NAME)?.id ?? null
    : null

  // Resolve effective bank id for a line — its tag if set, else the default bank.
  const resolveBankId = (line: ForecastLine): string | null => {
    const tagged = line.bankAccountId ?? null
    if (tagged) return tagged
    return defaultBankId
  }

  const linesByPeriod = new Map<string, ForecastLine[]>()
  for (const line of lines) {
    // In per-bank mode, drop any line whose effective bank isn't in the main set.
    if (perBankMode) {
      const effective = resolveBankId(line)
      if (!effective || !mainBankIds.has(effective)) continue
    }
    const existing = linesByPeriod.get(line.periodId) ?? []
    existing.push(line)
    linesByPeriod.set(line.periodId, existing)
  }

  const summaries: WeekSummary[] = []
  let previousClosing = 0
  // Rolling per-bank closing balances used to seed next week's opening.
  const previousPerBankClosing = new Map<string, number>()

  for (let weekIdx = 0; weekIdx < sorted.length; weekIdx++) {
    const period = sorted[weekIdx]
    const periodLines = linesByPeriod.get(period.id) ?? []

    let openingBalance = 0
    let totalInflows = 0
    let totalOutflows = 0
    let loansAndFinancing = 0

    // Per-bank net cash flow accumulator for this period.
    const perBankNet = new Map<string, number>()
    if (perBankMode) {
      for (const b of mainBanks) perBankNet.set(b.id, 0)
    }

    for (const line of periodLines) {
      const direction = getFlowDirection(line.categoryId, categoryMap)
      // Skip legacy balance-direction lines entirely — opening is now on bank_accounts.
      if (perBankMode && direction === 'balance') continue

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

      if (perBankMode) {
        const bankId = resolveBankId(line)
        if (bankId && perBankNet.has(bankId)) {
          // Inflow amounts are positive, outflow/loans are negative — so
          // net cash flow per bank is just the sum of amounts (by the
          // sign convention used everywhere else in this engine).
          perBankNet.set(bankId, (perBankNet.get(bankId) ?? 0) + amount)
        }
      }
    }

    // Per-bank balances for this week.
    let byBank: BankBalance[] = []
    if (perBankMode) {
      byBank = mainBanks.map((bank) => {
        const opening =
          weekIdx === 0
            ? bank.openingBalance
            : previousPerBankClosing.get(bank.id) ?? 0
        const netCashFlow = perBankNet.get(bank.id) ?? 0
        const closing = opening + netCashFlow
        return {
          bankAccountId: bank.id,
          bankName: bank.name,
          openingBalance: opening,
          netCashFlow,
          closingBalance: closing,
        }
      })

      // In per-bank mode, the group opening/closing are driven by byBank.
      openingBalance = byBank.reduce((s, b) => s + b.openingBalance, 0)
    } else {
      // Legacy behaviour: opening either from balance-direction lines or previous closing.
      const hasOpeningLines = periodLines.some(
        (l) => getFlowDirection(l.categoryId, categoryMap) === 'balance'
      )
      if (!hasOpeningLines && summaries.length > 0) {
        openingBalance = previousClosing
      }
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
      byBank,
    }

    summaries.push(summary)
    previousClosing = closingBalance
    if (perBankMode) {
      for (const b of byBank) previousPerBankClosing.set(b.bankAccountId, b.closingBalance)
    }
  }

  return summaries
}

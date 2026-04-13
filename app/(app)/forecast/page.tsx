import { createClient } from '@/lib/supabase/server'
import { Dashboard } from '@/components/forecast/dashboard'
import { loadForecastData, loadScenarioOverrides } from '@/lib/forecast/queries'
import { computeWeekSummaries, applyScenarioOverrides } from '@/lib/forecast/engine'
import { generateRecurringLines } from '@/lib/forecast/recurring'
import { AUGUSTO_GROUP_ID, type BankAccount } from '@/lib/types'
import { MAIN_FORECAST_BANK_NAMES } from '@/lib/forecast/constants'

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; weighted?: string }>
}) {
  const params = await searchParams
  const weighted = params.weighted !== 'false'

  const supabase = await createClient()
  const data = await loadForecastData(supabase, AUGUSTO_GROUP_ID)

  const recurringLines = data.rules.flatMap((rule) =>
    generateRecurringLines(rule, data.periods).map((l) => ({
      ...l,
      id: `recurring-${rule.id}-${l.periodId}`,
    }))
  )
  const baseLines = [...data.lines, ...recurringLines] as any[]

  const overrides = await loadScenarioOverrides(supabase, params.scenario)
  const { lines: allLines } = applyScenarioOverrides(baseLines, overrides, data.periods)

  // Per-bank mode: matches /forecast/detail so group totals + opening balances
  // stay consistent across the two views.
  const { data: rawBankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, entity_id, name, account_type, account_number, od_limit, opening_balance, is_active, notes')
    .in('name', [...MAIN_FORECAST_BANK_NAMES])
    .eq('is_active', true)

  const bankAccounts: BankAccount[] = (rawBankAccounts ?? []).map((b: any) => ({
    id: String(b.id),
    entityId: String(b.entity_id ?? ''),
    name: String(b.name ?? ''),
    accountType: (b.account_type as string | null) ?? null,
    accountNumber: (b.account_number as string | null) ?? null,
    odLimit: Number(b.od_limit) || 0,
    openingBalance: Number(b.opening_balance) || 0,
    isActive: b.is_active ?? true,
    notes: (b.notes as string | null) ?? null,
  }))

  const summaries = computeWeekSummaries(
    data.periods,
    allLines,
    data.categories,
    data.entityGroup?.odFacilityLimit ?? 0,
    weighted,
    bankAccounts,
  )

  const pipelineLines = allLines.filter((l) => l.confidence < 100 && l.amount > 0)
  const pipelineTotal = pipelineLines.reduce((sum, l) => sum + l.amount, 0)
  const pipelineWeighted = pipelineLines.reduce((sum, l) => sum + l.amount * (l.confidence / 100), 0)

  const breachWeek = summaries.findIndex((s) => s.isOverdrawn)
  const weeksUntilBreach = breachWeek >= 0 ? breachWeek : null

  const currentWeek = summaries[0] ?? null

  const pipelineByStage = { confirmed: 0, awaiting: 0, upcoming: 0, speculative: 0 }
  for (const line of allLines) {
    if (line.source !== 'pipeline') continue
    if (line.lineStatus === 'confirmed') pipelineByStage.confirmed += line.amount
    else if (line.lineStatus === 'awaiting_budget_approval') pipelineByStage.awaiting += line.amount
    else if (line.lineStatus === 'tbc') pipelineByStage.upcoming += line.amount
    else if (line.lineStatus === 'speculative') pipelineByStage.speculative += line.amount
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Cash Flow Overview</h1>
      </div>
      <Dashboard
        summaries={summaries}
        currentWeek={currentWeek}
        weeksUntilBreach={weeksUntilBreach}
        pipelineTotal={pipelineTotal}
        pipelineWeighted={Math.round(pipelineWeighted)}
        odFacilityLimit={data.entityGroup?.odFacilityLimit ?? 0}
        pipelineByStage={pipelineByStage}
      />
    </div>
  )
}

import { createClient } from '@/lib/supabase/server'
import { Tabs } from '@/components/ui/tabs'
import { SummaryCards } from '@/components/forecast/summary-cards'
import { ScenarioToolbar } from '@/components/forecast/scenario-toolbar'
import { ForecastGrid } from '@/components/forecast/forecast-grid'
import { loadForecastData } from '@/lib/forecast/queries'
import { computeWeekSummaries } from '@/lib/forecast/engine'
import { generateRecurringLines } from '@/lib/forecast/recurring'

const AUGUSTO_GROUP_ID = 'a0000000-0000-0000-0000-000000000001'

const forecastTabs = [
  { label: 'Augusto Group', href: '/forecast' },
  { label: 'Coachmate', href: '/forecast/coachmate' },
  { label: 'Intercompany', href: '/forecast/intercompany' },
]

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
  const allLines = [...data.lines, ...recurringLines] as any[]

  const summaries = computeWeekSummaries(
    data.periods,
    allLines,
    data.categories,
    data.entityGroup?.odFacilityLimit ?? 0,
    weighted,
  )

  const pipelineLines = allLines.filter((l) => l.confidence < 100 && l.amount > 0)
  const pipelineTotal = pipelineLines.reduce((sum, l) => sum + l.amount, 0)
  const pipelineWeighted = pipelineLines.reduce((sum, l) => sum + l.amount * (l.confidence / 100), 0)

  const breachWeek = summaries.findIndex((s) => s.isOverdrawn)
  const weeksUntilBreach = breachWeek >= 0 ? breachWeek : null

  const { data: scenarios } = await supabase.from('scenarios').select('*').order('created_at')

  const weekRange = data.periods.length > 0
    ? `${data.periods.length} weeks · ${data.periods[0].weekEnding} → ${data.periods[data.periods.length - 1].weekEnding}`
    : ''

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cash Flow Forecast</h1>
        <div className="flex gap-2">
          <a href="/documents" className="rounded-md border border-border bg-surface-overlay px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Upload Documents
          </a>
          <a href="/settings/recurring" className="rounded-md border border-border bg-surface-overlay px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
            Recurring Rules
          </a>
        </div>
      </div>

      <SummaryCards
        currentWeek={summaries[0] ?? null}
        weeksUntilBreach={weeksUntilBreach}
        pipelineTotal={pipelineTotal}
        pipelineWeighted={Math.round(pipelineWeighted)}
      />

      <Tabs tabs={forecastTabs} />
      <ScenarioToolbar scenarios={scenarios ?? []} weekRange={weekRange} />
      <ForecastGrid
        periods={data.periods}
        categories={data.categories}
        lines={allLines}
        summaries={summaries}
      />
    </div>
  )
}

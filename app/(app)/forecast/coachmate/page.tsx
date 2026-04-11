import { createClient } from '@/lib/supabase/server'
import { Tabs } from '@/components/ui/tabs'
import { SummaryCards } from '@/components/forecast/summary-cards'
import { ScenarioToolbar } from '@/components/forecast/scenario-toolbar'
import { ForecastGrid } from '@/components/forecast/forecast-grid'
import { loadForecastData } from '@/lib/forecast/queries'
import { computeWeekSummaries } from '@/lib/forecast/engine'
import { generateRecurringLines } from '@/lib/forecast/recurring'
import { COACHMATE_GROUP_ID } from '@/lib/types'

const forecastTabs = [
  { label: 'Augusto Group', href: '/forecast' },
  { label: 'Coachmate', href: '/forecast/coachmate' },
  { label: 'Intercompany', href: '/forecast/intercompany' },
]

export default async function CoachmateForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ weighted?: string }>
}) {
  const params = await searchParams
  const weighted = params.weighted !== 'false'
  const supabase = await createClient()
  const data = await loadForecastData(supabase, COACHMATE_GROUP_ID)

  const recurringLines = data.rules.flatMap((rule) =>
    generateRecurringLines(rule, data.periods).map((l) => ({ ...l, id: `recurring-${rule.id}-${l.periodId}` }))
  )
  const allLines = [...data.lines, ...recurringLines] as any[]

  const summaries = computeWeekSummaries(data.periods, allLines, data.categories, 0, weighted)

  const pipelineLines = allLines.filter((l) => l.confidence < 100 && l.amount > 0)
  const pipelineTotal = pipelineLines.reduce((sum, l) => sum + l.amount, 0)
  const pipelineWeighted = pipelineLines.reduce((sum, l) => sum + l.amount * (l.confidence / 100), 0)
  const breachWeek = summaries.findIndex((s) => s.isOverdrawn)

  const { data: scenarios } = await supabase.from('scenarios').select('*').order('created_at')

  return (
    <div>
      <div className="mb-4"><h1 className="text-xl font-semibold">Cash Flow Forecast — Coachmate</h1></div>
      <SummaryCards currentWeek={summaries[0] ?? null} weeksUntilBreach={breachWeek >= 0 ? breachWeek : null} pipelineTotal={pipelineTotal} pipelineWeighted={Math.round(pipelineWeighted)} odFacilityLimit={0} />
      <Tabs tabs={forecastTabs} />
      <ScenarioToolbar scenarios={scenarios ?? []} weekRange={`${data.periods.length} weeks`} />
      <ForecastGrid periods={data.periods} categories={data.categories} lines={allLines} summaries={summaries} />
    </div>
  )
}

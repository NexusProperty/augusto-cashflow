import { createClient } from '@/lib/supabase/server'
import { loadForecastData, loadScenarioOverrides } from '@/lib/forecast/queries'
import { generateRecurringLines } from '@/lib/forecast/recurring'
import { computeWeekSummaries, applyScenarioOverrides } from '@/lib/forecast/engine'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { ForecastGrid } from '@/components/forecast/forecast-grid'
import { ScenarioToolbar } from '@/components/forecast/scenario-toolbar'
import { weekEndingLabel } from '@/lib/utils'

export default async function ForecastDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; weighted?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const weighted = params.weighted !== 'false'

  const data = await loadForecastData(supabase, AUGUSTO_GROUP_ID)

  const recurringLines = data.rules.flatMap((rule) =>
    generateRecurringLines(rule, data.periods).map((l) => ({
      ...l,
      id: `recurring-${rule.id}-${l.periodId}`,
    }))
  )
  const baseLines = [...data.lines, ...recurringLines] as any[]

  const overrides = await loadScenarioOverrides(supabase, params.scenario)
  const { lines: allLines, overriddenIds } = applyScenarioOverrides(baseLines, overrides, data.periods)

  const summaries = computeWeekSummaries(
    data.periods,
    allLines,
    data.categories,
    data.entityGroup?.odFacilityLimit ?? 0,
    weighted,
  )

  const { data: scenariosRaw } = await supabase
    .from('scenarios')
    .select('id, name, is_default')
    .order('name')

  const scenarios = (scenariosRaw ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    isDefault: s.is_default ?? false,
  }))

  const sortedPeriods = [...data.periods].sort(
    (a, b) => new Date(a.weekEnding).getTime() - new Date(b.weekEnding).getTime()
  )
  const firstPeriod = sortedPeriods[0]
  const lastPeriod = sortedPeriods[sortedPeriods.length - 1]
  const weekRange =
    firstPeriod && lastPeriod
      ? `${weekEndingLabel(new Date(firstPeriod.weekEnding))} – ${weekEndingLabel(new Date(lastPeriod.weekEnding))}`
      : ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Cash Flow Detail</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Augusto Group — 18-week rolling forecast</p>
        </div>
      </div>
      <ScenarioToolbar scenarios={scenarios} weekRange={weekRange} />
      <ForecastGrid
        periods={data.periods}
        categories={data.categories}
        lines={allLines}
        summaries={summaries}
        weighted={weighted}
        odFacilityLimit={data.entityGroup?.odFacilityLimit ?? 0}
        overriddenIds={Array.from(overriddenIds)}
        overrideScenarioLabel={
          scenarios.find((s) => s.id === params.scenario)?.name ?? undefined
        }
      />
    </div>
  )
}

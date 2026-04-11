import { createClient } from '@/lib/supabase/server'
import { loadForecastData } from '@/lib/forecast/queries'
import { computeWeekSummaries } from '@/lib/forecast/engine'
import { generateRecurringLines } from '@/lib/forecast/recurring'
import { weekEndingLabel, formatCurrency, cn } from '@/lib/utils'
import { AUGUSTO_GROUP_ID } from '@/lib/types'

export default async function CompareScenarios() {
  const supabase = await createClient()
  const { data: scenarios } = await supabase.from('scenarios').select('*').order('created_at')
  const data = await loadForecastData(supabase, AUGUSTO_GROUP_ID)

  const recurringLines = data.rules.flatMap((rule) =>
    generateRecurringLines(rule, data.periods).map((l) => ({ ...l, id: `recurring-${rule.id}-${l.periodId}` }))
  )
  const allLines = [...data.lines, ...recurringLines] as any[]

  const baseSummaries = computeWeekSummaries(data.periods, allLines, data.categories, data.entityGroup?.odFacilityLimit ?? 0, true)

  const bestLines = allLines.map((l) => ({
    ...l,
    confidence: l.confidence < 100 ? Math.max(l.confidence, 90) : l.confidence,
  }))
  const bestSummaries = computeWeekSummaries(data.periods, bestLines, data.categories, data.entityGroup?.odFacilityLimit ?? 0, true)

  const worstLines = allLines.map((l) => ({
    ...l,
    confidence: l.confidence < 100 ? Math.min(l.confidence, 30) : l.confidence,
  }))
  const worstSummaries = computeWeekSummaries(data.periods, worstLines, data.categories, data.entityGroup?.odFacilityLimit ?? 0, true)

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Scenario Comparison</h1>
      <p className="mb-6 text-sm text-zinc-500">Closing balance per week across all scenarios</p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 text-left text-xs font-medium text-zinc-500">Scenario</th>
              {data.periods.map((p) => (
                <th key={p.id} className="bg-zinc-50 px-3 py-3 text-right text-xs font-medium text-zinc-500">
                  {weekEndingLabel(new Date(p.weekEnding))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ScenarioRow label="Base Case" summaries={baseSummaries} color="text-zinc-900" />
            <ScenarioRow label="Best Case" summaries={bestSummaries} color="text-emerald-600" />
            <ScenarioRow label="Worst Case" summaries={worstSummaries} color="text-red-600" />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScenarioRow({ label, summaries, color }: {
  label: string
  summaries: { closingBalance: number; isOverdrawn: boolean }[]
  color: string
}) {
  return (
    <tr className="border-b border-zinc-100">
      <td className={cn('sticky left-0 z-10 bg-white px-4 py-3 font-medium', color)}>{label}</td>
      {summaries.map((s, i) => (
        <td key={i} className={cn('px-3 py-3 text-right tabular-nums', s.isOverdrawn ? 'font-bold text-red-600' : color)}>
          {formatCurrency(s.closingBalance)}
        </td>
      ))}
    </tr>
  )
}

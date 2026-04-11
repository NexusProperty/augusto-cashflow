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

  // Base = weighted at stated confidence
  const baseSummaries = computeWeekSummaries(data.periods, allLines, data.categories, data.entityGroup?.odFacilityLimit ?? 0, true)

  // Best = pipeline bumped to 90%
  const bestLines = allLines.map((l) => ({
    ...l,
    confidence: l.confidence < 100 ? Math.max(l.confidence, 90) : l.confidence,
  }))
  const bestSummaries = computeWeekSummaries(data.periods, bestLines, data.categories, data.entityGroup?.odFacilityLimit ?? 0, true)

  // Worst = pipeline dropped to 30%
  const worstLines = allLines.map((l) => ({
    ...l,
    confidence: l.confidence < 100 ? Math.min(l.confidence, 30) : l.confidence,
  }))
  const worstSummaries = computeWeekSummaries(data.periods, worstLines, data.categories, data.entityGroup?.odFacilityLimit ?? 0, true)

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Scenario Comparison</h1>
      <p className="mb-6 text-sm text-text-muted">Closing balance per week across all scenarios</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface-raised px-4 py-3 text-left text-xs text-text-muted">Scenario</th>
              {data.periods.map((p) => (
                <th key={p.id} className="bg-surface-raised px-3 py-3 text-right text-xs text-text-muted">
                  {weekEndingLabel(new Date(p.weekEnding))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ScenarioRow label="Base Case" summaries={baseSummaries} color="text-[#a5b4fc]" />
            <ScenarioRow label="Best Case" summaries={bestSummaries} color="text-positive" />
            <ScenarioRow label="Worst Case" summaries={worstSummaries} color="text-negative" />
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
    <tr className="border-b border-border/50">
      <td className={cn('sticky left-0 z-10 bg-surface px-4 py-3 font-medium', color)}>{label}</td>
      {summaries.map((s, i) => (
        <td key={i} className={cn('px-3 py-3 text-right', s.isOverdrawn ? 'font-bold text-negative' : color)}>
          {formatCurrency(s.closingBalance)}
        </td>
      ))}
    </tr>
  )
}

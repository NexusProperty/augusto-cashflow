import { createClient } from '@/lib/supabase/server'
import { loadPipelineData, loadPipelineEntities } from '@/lib/pipeline/queries'
import { getFiscalYearMonths, getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'
import { computeBUSummary } from '@/lib/pipeline/summary'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { SummaryTable } from '@/components/pipeline/summary-table'
import { FiscalYearNav } from '@/components/pipeline/fiscal-year-nav'

export default async function PipelineSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const currentFY = getCurrentFiscalYear()
  const fy = parseInt(params.fy ?? String(currentFY), 10)
  const months = getFiscalYearMonths(fy)

  const entities = await loadPipelineEntities(supabase, AUGUSTO_GROUP_ID)
  const entityIds = entities.map((e: any) => e.id)

  const { projects, targets } = await loadPipelineData(supabase, entityIds, months)
  const summaryRows = computeBUSummary(
    projects,
    entities.map((e: any) => ({ id: e.id, name: e.name })),
    targets,
    months,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Pipeline Summary</h1>
        <FiscalYearNav />
      </div>
      <SummaryTable rows={summaryRows} months={months} />
    </div>
  )
}

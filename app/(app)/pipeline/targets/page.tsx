import { createClient } from '@/lib/supabase/server'
import { loadPipelineEntities } from '@/lib/pipeline/queries'
import { getFiscalYearMonths, getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { TargetGrid } from '@/components/pipeline/target-grid'
import { FiscalYearNav } from '@/components/pipeline/fiscal-year-nav'

export default async function PipelineTargetsPage({
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

  const { data: rawTargets } = await supabase
    .from('revenue_targets')
    .select('*')
    .in('entity_id', entityIds)
    .gte('month', months[0])
    .lte('month', months[months.length - 1])

  const targets = (rawTargets ?? []).map((t: any) => ({
    entityId: t.entity_id,
    month: t.month,
    targetAmount: Number(t.target_amount) || 0,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Revenue Targets</h1>
        <FiscalYearNav />
      </div>
      <TargetGrid entities={entities} months={months} targets={targets} />
    </div>
  )
}

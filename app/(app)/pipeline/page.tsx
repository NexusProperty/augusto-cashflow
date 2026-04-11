import { createClient } from '@/lib/supabase/server'
import { loadPipelineData, loadEntities } from '@/lib/pipeline/queries'
import { getFiscalYearMonths, getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { PipelineGrid } from '@/components/pipeline/pipeline-grid'
import { FiscalYearNav } from '@/components/pipeline/fiscal-year-nav'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; entity?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const currentFY = getCurrentFiscalYear()
  const fy = parseInt(params.fy ?? String(currentFY), 10)
  const months = getFiscalYearMonths(fy)

  const entities = await loadEntities(supabase, AUGUSTO_GROUP_ID)
  const entityIds = entities.map((e: any) => e.id)
  const selectedEntityId = params.entity ?? entityIds[0] ?? ''

  const { clients, projects, targets: _targets } = await loadPipelineData(supabase, entityIds, months)

  const filteredProjects = selectedEntityId
    ? projects.filter((p) => p.entityId === selectedEntityId)
    : projects

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Revenue Pipeline</h1>
        <FiscalYearNav />
      </div>
      <PipelineGrid
        projects={filteredProjects}
        clients={clients}
        entities={entities}
        months={months}
        selectedEntityId={selectedEntityId}
      />
    </div>
  )
}

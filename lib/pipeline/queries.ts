import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PipelineClient,
  PipelineProject,
  PipelineAllocation,
  PipelineProjectRow,
  RevenueTarget,
} from './types'

function mapClient(row: any): PipelineClient {
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    isActive: row.is_active,
    notes: row.notes,
  }
}

function mapProject(row: any): PipelineProject {
  return {
    id: row.id,
    clientId: row.client_id,
    entityId: row.entity_id,
    jobNumber: row.job_number,
    projectName: row.project_name,
    taskEstimate: row.task_estimate,
    stage: row.stage,
    teamMember: row.team_member,
    billingAmount: row.billing_amount != null ? Number(row.billing_amount) : null,
    thirdPartyCosts: row.third_party_costs != null ? Number(row.third_party_costs) : null,
    grossProfit: row.gross_profit != null ? Number(row.gross_profit) : null,
    invoiceDate: row.invoice_date,
    notes: row.notes,
    isSynced: row.is_synced,
    createdBy: row.created_by,
  }
}

function mapAllocation(row: any): PipelineAllocation {
  return {
    id: row.id,
    projectId: row.project_id,
    month: row.month,
    amount: Number(row.amount) || 0,
    distribution: row.distribution,
  }
}

function mapTarget(row: any): RevenueTarget {
  return {
    id: row.id,
    entityId: row.entity_id,
    month: row.month,
    targetAmount: Number(row.target_amount) || 0,
  }
}

/** Load all pipeline data for a set of entities within a fiscal year's months */
export async function loadPipelineData(
  supabase: SupabaseClient,
  entityIds: string[],
  months: string[],
): Promise<{
  clients: PipelineClient[]
  projects: PipelineProjectRow[]
  targets: RevenueTarget[]
}> {
  const [
    { data: rawClients },
    { data: rawProjects },
    { data: rawAllocations },
    { data: rawTargets },
  ] = await Promise.all([
    supabase
      .from('pipeline_clients')
      .select('*')
      .in('entity_id', entityIds)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('pipeline_projects')
      .select('*')
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_allocations')
      .select('*, pipeline_projects!inner(entity_id)')
      .in('pipeline_projects.entity_id', entityIds)
      .gte('month', months[0])
      .lte('month', months[months.length - 1]),
    supabase
      .from('revenue_targets')
      .select('*')
      .in('entity_id', entityIds)
      .gte('month', months[0])
      .lte('month', months[months.length - 1]),
  ])

  const clients = (rawClients ?? []).map(mapClient)
  const allocs = (rawAllocations ?? []).map(mapAllocation)
  const targets = (rawTargets ?? []).map(mapTarget)

  const clientMap = new Map(clients.map((c) => [c.id, c.name]))

  const projects: PipelineProjectRow[] = (rawProjects ?? []).map((row) => {
    const proj = mapProject(row)
    const projAllocs = allocs.filter((a) => a.projectId === proj.id)
    return {
      ...proj,
      clientName: clientMap.get(proj.clientId) ?? 'Unknown',
      allocations: projAllocs,
      totalAmount: projAllocs.reduce((s, a) => s + a.amount, 0),
    }
  })

  return { clients, projects, targets }
}

/** Load entities for a group */
export async function loadEntities(supabase: SupabaseClient, groupId: string) {
  const { data } = await supabase
    .from('entities')
    .select('id, name, code')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

/** Load forecast periods (week_endings) for building the period map */
export async function loadForecastPeriods(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('forecast_periods')
    .select('id, week_ending')
    .order('week_ending')
  return (data ?? []).map((r: any) => ({ id: r.id, weekEnding: r.week_ending }))
}

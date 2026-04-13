import { createClient } from '@/lib/supabase/server'
import { AUGUSTO_GROUP_ID, COACHMATE_GROUP_ID } from '@/lib/types'

const ALLOWED_GROUPS: ReadonlySet<string> = new Set([AUGUSTO_GROUP_ID, COACHMATE_GROUP_ID])

export function isAllowedGroup(groupId: string | null | undefined): boolean {
  return !!groupId && ALLOWED_GROUPS.has(groupId)
}

export interface ScopeCheckBatch {
  inScope: string[]
  outOfScope: string[]
}

export async function assertForecastLinesInScope(lineIds: string[]): Promise<ScopeCheckBatch> {
  if (lineIds.length === 0) return { inScope: [], outOfScope: [] }
  const supabase = await createClient()
  const { data } = await supabase
    .from('forecast_lines')
    .select('id, entities!inner(group_id)')
    .in('id', lineIds)

  const byId = new Map<string, string | null>()
  for (const row of (data ?? []) as unknown as Array<{
    id: string
    entities: { group_id: string } | { group_id: string }[] | null
  }>) {
    const ent = row.entities
    const groupId = Array.isArray(ent) ? ent[0]?.group_id ?? null : ent?.group_id ?? null
    byId.set(row.id, groupId)
  }

  const inScope: string[] = []
  const outOfScope: string[] = []
  for (const id of lineIds) {
    if (isAllowedGroup(byId.get(id) ?? null)) inScope.push(id)
    else outOfScope.push(id)
  }
  return { inScope, outOfScope }
}

export async function assertEntityInScope(entityId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.from('entities').select('group_id').eq('id', entityId).maybeSingle()
  return isAllowedGroup(data?.group_id ?? null)
}

function extractGroupId(
  row: { entities: { group_id: string } | { group_id: string }[] | null } | null,
): string | null {
  if (!row) return null
  const ent = row.entities
  if (!ent) return null
  if (Array.isArray(ent)) return ent[0]?.group_id ?? null
  return ent.group_id
}

export async function assertOverrideTargetInScope(
  targetType: 'pipeline_item' | 'recurring_rule',
  targetId: string,
): Promise<boolean> {
  const supabase = await createClient()
  const table = targetType === 'pipeline_item' ? 'pipeline_projects' : 'recurring_rules'
  const { data } = await supabase
    .from(table)
    .select('entities!inner(group_id)')
    .eq('id', targetId)
    .maybeSingle()
  return isAllowedGroup(extractGroupId(data as never))
}

export async function assertScenarioOverrideInScope(overrideId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('scenario_overrides')
    .select('target_type, target_id')
    .eq('id', overrideId)
    .maybeSingle()
  if (!data) return false
  return assertOverrideTargetInScope(data.target_type as 'pipeline_item' | 'recurring_rule', data.target_id)
}

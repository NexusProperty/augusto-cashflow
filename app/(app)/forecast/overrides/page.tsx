import { createClient } from '@/lib/supabase/server'
import { OverridesManager } from '@/components/forecast/overrides-manager'

export const dynamic = 'force-dynamic'

export default async function OverridesPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [
    { data: scenarios },
    { data: overrides },
    { data: projects },
    { data: rules },
    { data: entities },
  ] = await Promise.all([
    supabase.from('scenarios').select('id, name, is_default').order('name'),
    supabase.from('scenario_overrides').select('*'),
    supabase
      .from('pipeline_projects')
      .select('id, project_name, entity_id, pipeline_clients(name)')
      .order('project_name'),
    supabase
      .from('recurring_rules')
      .select('id, description, entity_id, amount, frequency')
      .eq('is_active', true)
      .order('description'),
    supabase.from('entities').select('id, name').eq('is_active', true),
  ])

  const scenarioList = (scenarios ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    isDefault: s.is_default ?? false,
  }))

  const entityMap = new Map((entities ?? []).map((e: any) => [e.id, e.name]))

  const projectOptions = (projects ?? []).map((p: any) => ({
    id: p.id,
    label: `${p.pipeline_clients?.name ?? '—'} — ${p.project_name}${
      entityMap.get(p.entity_id) ? ` (${entityMap.get(p.entity_id)})` : ''
    }`,
  }))

  const ruleOptions = (rules ?? []).map((r: any) => ({
    id: r.id,
    label: `${r.description} — ${entityMap.get(r.entity_id) ?? '—'} (${r.frequency})`,
  }))

  const overrideList = (overrides ?? []).map((o: any) => ({
    id: o.id,
    scenarioId: o.scenario_id,
    targetType: o.target_type as 'pipeline_item' | 'recurring_rule',
    targetId: o.target_id,
    overrideConfidence: o.override_confidence,
    overrideAmount: o.override_amount !== null ? Number(o.override_amount) : null,
    overrideWeekShift: o.override_week_shift ?? 0,
    isExcluded: o.is_excluded ?? false,
  }))

  const defaultScenario =
    params.scenario ??
    scenarioList.find((s) => !s.isDefault)?.id ??
    scenarioList[0]?.id ??
    ''

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Scenario Overrides</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Per-item tweaks (amount, confidence, week shift, exclude) applied on top of the base forecast for a given scenario.
        </p>
      </div>
      <OverridesManager
        scenarios={scenarioList}
        overrides={overrideList}
        projectOptions={projectOptions}
        ruleOptions={ruleOptions}
        initialScenarioId={defaultScenario}
      />
    </div>
  )
}

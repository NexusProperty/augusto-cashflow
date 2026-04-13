-- Migration 021 — DB integrity fixes from 2026-04-13 code review
--
-- 1. UNIQUE (code) on categories   — seed.sql's `on conflict do nothing`
--                                    depends on this; without it, db:reset
--                                    silently duplicates new categories.
-- 2. UNIQUE on scenario_overrides(scenario_id, target_type, target_id)
--                                  — prevents duplicate overrides for the
--                                    same target in the same scenario.
-- 3. Index on entities.is_pipeline_entity (partial) for the filter query.
-- 4. sync_pipeline_project_lines() RPC — atomic delete+insert for the
--    pipeline sync so a partial-failure insert doesn't leave the project's
--    forecast lines wiped.

begin;

-- ── 1. Categories code uniqueness ─────────────────────────────────────────

-- Dedupe any duplicates introduced by past `on conflict do nothing` without
-- the unique constraint. Keep the row with the lowest id (stable ordering).
delete from categories c1
using categories c2
where c1.code = c2.code
  and c1.id > c2.id;

alter table categories
  add constraint categories_code_unique unique (code);

-- ── 2. Scenario override uniqueness ───────────────────────────────────────

-- Dedupe: keep lowest id per (scenario_id, target_type, target_id).
delete from scenario_overrides o1
using scenario_overrides o2
where o1.scenario_id = o2.scenario_id
  and o1.target_type = o2.target_type
  and o1.target_id = o2.target_id
  and o1.id > o2.id;

alter table scenario_overrides
  add constraint scenario_overrides_scenario_target_unique
    unique (scenario_id, target_type, target_id);

-- ── 3. Partial index on entities.is_pipeline_entity ───────────────────────

create index if not exists idx_entities_pipeline_active
  on entities (group_id)
  where is_pipeline_entity = true;

-- ── 4. Atomic pipeline-sync RPC ───────────────────────────────────────────

create or replace function sync_pipeline_project_lines(
  p_project_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_deleted integer := 0;
  v_inserted integer := 0;
begin
  delete from forecast_lines
    where source_pipeline_project_id = p_project_id;
  get diagnostics v_deleted = row_count;

  if jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    insert into forecast_lines (
      entity_id, category_id, period_id, bank_account_id, amount, confidence,
      source, counterparty, notes, source_pipeline_project_id, line_status,
      created_by
    )
    select
      (elem->>'entity_id')::uuid,
      (elem->>'category_id')::uuid,
      (elem->>'period_id')::uuid,
      nullif(elem->>'bank_account_id', '')::uuid,
      (elem->>'amount')::numeric,
      coalesce((elem->>'confidence')::integer, 100),
      coalesce((elem->>'source')::source_type, 'pipeline'::source_type),
      nullif(elem->>'counterparty', ''),
      nullif(elem->>'notes', ''),
      p_project_id,
      coalesce(elem->>'line_status', 'confirmed'),
      nullif(elem->>'created_by', '')::uuid
    from jsonb_array_elements(p_lines) as elem;
    get diagnostics v_inserted = row_count;
  end if;

  return jsonb_build_object(
    'project_id', p_project_id,
    'deleted', v_deleted,
    'inserted', v_inserted
  );
end;
$$;

-- Let authenticated users call the RPC. RLS on forecast_lines still applies
-- via security invoker.
grant execute on function sync_pipeline_project_lines(uuid, jsonb) to authenticated;

commit;

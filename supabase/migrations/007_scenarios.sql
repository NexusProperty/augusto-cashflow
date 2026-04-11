create table scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create type override_target_type as enum ('pipeline_item', 'recurring_rule');

create table scenario_overrides (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  target_type override_target_type not null,
  target_id uuid not null,
  override_confidence integer check (override_confidence >= 0 and override_confidence <= 100),
  override_amount numeric,
  override_week_shift integer default 0,
  is_excluded boolean default false,
  created_at timestamptz default now()
);

create index idx_scenario_overrides_scenario on scenario_overrides(scenario_id);
create index idx_scenario_overrides_target on scenario_overrides(target_id);

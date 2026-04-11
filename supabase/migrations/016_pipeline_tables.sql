-- 016_pipeline_tables.sql
-- Revenue pipeline module: clients, projects, allocations, targets

-- Pipeline clients (end-clients/brands per entity)
create table pipeline_clients (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, name)
);

create index idx_pipeline_clients_entity on pipeline_clients(entity_id);

-- Pipeline projects (individual jobs per client)
create table pipeline_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references pipeline_clients(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  job_number text,
  project_name text not null,
  task_estimate text,
  stage text not null default 'speculative'
    check (stage in ('confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined')),
  team_member text,
  billing_amount numeric,
  third_party_costs numeric,
  gross_profit numeric,
  invoice_date text,
  notes text,
  is_synced boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pipeline_projects_client on pipeline_projects(client_id);
create index idx_pipeline_projects_entity on pipeline_projects(entity_id);
create index idx_pipeline_projects_stage on pipeline_projects(stage);

-- Pipeline allocations (monthly revenue per project)
create table pipeline_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pipeline_projects(id) on delete cascade,
  month date not null,
  amount numeric not null default 0,
  distribution text not null default 'even'
    check (distribution in ('even', 'first_week', 'last_week', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, month)
);

create index idx_pipeline_allocations_project on pipeline_allocations(project_id);
create index idx_pipeline_allocations_month on pipeline_allocations(month);

-- Revenue targets (monthly per entity)
create table revenue_targets (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  month date not null,
  target_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, month)
);

create index idx_revenue_targets_entity on revenue_targets(entity_id);
create index idx_revenue_targets_month on revenue_targets(month);

-- Add pipeline FK to forecast_lines
alter table forecast_lines
  add column if not exists source_pipeline_project_id uuid
    references pipeline_projects(id) on delete set null;

create index idx_forecast_lines_pipeline_project
  on forecast_lines(source_pipeline_project_id)
  where source_pipeline_project_id is not null;

-- RLS policies
alter table pipeline_clients enable row level security;
create policy "authenticated_full_access" on pipeline_clients
  for all to authenticated using (true) with check (true);

alter table pipeline_projects enable row level security;
create policy "authenticated_full_access" on pipeline_projects
  for all to authenticated using (true) with check (true);

alter table pipeline_allocations enable row level security;
create policy "authenticated_full_access" on pipeline_allocations
  for all to authenticated using (true) with check (true);

alter table revenue_targets enable row level security;
create policy "authenticated_full_access" on revenue_targets
  for all to authenticated using (true) with check (true);

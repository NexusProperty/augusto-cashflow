create type source_type as enum ('manual', 'document', 'recurring', 'pipeline');

create table forecast_lines (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  period_id uuid not null references forecast_periods(id) on delete cascade,
  amount numeric not null default 0,
  confidence integer not null default 100 check (confidence >= 0 and confidence <= 100),
  source source_type not null default 'manual',
  source_document_id uuid,
  source_rule_id uuid,
  counterparty text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_forecast_lines_period on forecast_lines(period_id);
create index idx_forecast_lines_entity on forecast_lines(entity_id);
create index idx_forecast_lines_category on forecast_lines(category_id);
create index idx_forecast_lines_source_doc on forecast_lines(source_document_id);
create index idx_forecast_lines_source_rule on forecast_lines(source_rule_id);
create index idx_forecast_lines_grid on forecast_lines(entity_id, period_id, category_id);

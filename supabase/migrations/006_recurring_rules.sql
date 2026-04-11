create type frequency_type as enum ('weekly', 'fortnightly', 'monthly');

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  description text not null,
  amount numeric not null,
  frequency frequency_type not null,
  anchor_date date not null,
  day_of_month integer check (day_of_month >= 1 and day_of_month <= 31),
  end_date date,
  is_active boolean default true,
  counterparty text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table forecast_lines
  add constraint fk_forecast_lines_rule
  foreign key (source_rule_id) references recurring_rules(id) on delete set null;

create index idx_recurring_rules_entity on recurring_rules(entity_id);

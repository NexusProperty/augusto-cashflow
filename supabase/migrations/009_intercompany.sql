create table intercompany_balances (
  id uuid primary key default gen_random_uuid(),
  from_group_id uuid not null references entity_groups(id) on delete cascade,
  to_group_id uuid not null references entity_groups(id) on delete cascade,
  description text not null,
  amount numeric not null,
  as_at_date date not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (from_group_id != to_group_id)
);

create index idx_intercompany_groups on intercompany_balances(from_group_id, to_group_id);

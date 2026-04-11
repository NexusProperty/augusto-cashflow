create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  name text not null,
  account_type text default 'operating',
  od_limit numeric default 0,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_bank_accounts_entity on bank_accounts(entity_id);

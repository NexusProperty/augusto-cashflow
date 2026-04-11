create table entity_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  od_facility_limit numeric default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table entities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references entity_groups(id) on delete cascade,
  name text not null,
  code text not null unique,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_entities_group on entities(group_id);

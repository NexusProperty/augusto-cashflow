create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id) on delete cascade,
  name text not null,
  code text not null unique,
  section_number text,
  sort_order integer not null default 0,
  is_system boolean default false,
  flow_direction text check (flow_direction in ('inflow', 'outflow', 'balance', 'computed')),
  created_at timestamptz default now()
);

create index idx_categories_parent on categories(parent_id);

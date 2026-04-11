create table forecast_periods (
  id uuid primary key default gen_random_uuid(),
  week_ending date not null unique,
  is_actual boolean default false,
  created_at timestamptz default now()
);

create index idx_forecast_periods_week on forecast_periods(week_ending);

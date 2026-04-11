alter table entity_groups enable row level security;
alter table entities enable row level security;
alter table bank_accounts enable row level security;
alter table categories enable row level security;
alter table forecast_periods enable row level security;
alter table forecast_lines enable row level security;
alter table recurring_rules enable row level security;
alter table scenarios enable row level security;
alter table scenario_overrides enable row level security;
alter table documents enable row level security;
alter table document_extractions enable row level security;
alter table intercompany_balances enable row level security;
alter table category_mappings enable row level security;

create policy "authenticated_full_access" on entity_groups
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on entities
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on bank_accounts
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on categories
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on forecast_periods
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on forecast_lines
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on recurring_rules
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on scenarios
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on scenario_overrides
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on documents
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on document_extractions
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on intercompany_balances
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on category_mappings
  for all to authenticated using (true) with check (true);

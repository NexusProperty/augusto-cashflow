-- supabase/seed.sql
-- Safe re-runnable: uses ON CONFLICT DO NOTHING

-- Entity Groups
insert into entity_groups (id, name, od_facility_limit, notes) values
  ('a0000000-0000-0000-0000-000000000001', 'Augusto Group', 900000, 'Consolidated — AUG, CNR, DD, AGC, BAL, WRS, ENT'),
  ('a0000000-0000-0000-0000-000000000002', 'Coachmate', 0, 'Separate entity')
on conflict do nothing;

-- Entities
insert into entities (id, group_id, name, code) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Augusto', 'AUG'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Cornerstore', 'CNR'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Dark Doris', 'DD'),
  ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Augusto Commercial', 'AGC'),
  ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Ballyhoo', 'BAL'),
  ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Wrestler', 'WRS'),
  ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Entertainment', 'ENT'),
  ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'Coachmate', 'CM')
on conflict do nothing;

-- Bank Accounts (matching the Excel)
insert into bank_accounts (entity_id, name, account_type, od_limit) values
  ('e0000000-0000-0000-0000-000000000001', 'AUG OD Account', 'overdraft', 900000),
  ('e0000000-0000-0000-0000-000000000001', 'AUG Staff Payments', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000001', 'AUG Production (DIRAFT)', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000004', 'Augusto Commercial', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000002', 'Cornerstore', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000003', 'DD5', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000003', 'DD3', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000003', 'DD2', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000001', 'AUG Euro Account', 'operating', 0),
  ('e0000000-0000-0000-0000-000000000008', 'Coachmate', 'operating', 0)
on conflict do nothing;

-- Categories (hierarchical, matching Excel sections)
-- Level 0: Sections
insert into categories (id, parent_id, name, code, section_number, sort_order, is_system, flow_direction) values
  ('c0000000-0000-0000-0000-000000000001', null, 'Opening Bank Balance', 'opening', '1', 100, true, 'balance'),
  ('c0000000-0000-0000-0000-000000000002', null, 'Operating Inflows', 'inflows', '2', 200, true, 'inflow'),
  ('c0000000-0000-0000-0000-000000000003', null, 'Operating Outflows', 'outflows', '3', 300, true, 'outflow'),
  ('c0000000-0000-0000-0000-000000000004', null, 'Loans & Financing', 'loans', '4', 400, true, 'outflow'),
  ('c0000000-0000-0000-0000-000000000005', null, 'Closing Balance & Headroom', 'closing', '5', 500, true, 'computed')
on conflict do nothing;

-- Level 1: Sub-sections
insert into categories (id, parent_id, name, code, section_number, sort_order, is_system, flow_direction) values
  ('c0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000002', 'Accounts Receivable', 'inflows_ar', '2a', 210, true, 'inflow'),
  ('c0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'Other Cash Receipts', 'inflows_other', '2b', 220, true, 'inflow'),
  ('c0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', 'GST (Net)', 'inflows_gst', '2c', 230, true, 'inflow'),
  ('c0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000003', 'Payroll', 'outflows_payroll', '3a', 310, true, 'outflow'),
  ('c0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000003', 'PAYE', 'outflows_paye', '3b', 320, true, 'outflow'),
  ('c0000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000003', 'Direct Debits & Fixed Overheads', 'outflows_dd', '3c', 330, true, 'outflow'),
  ('c0000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000003', 'Rent', 'outflows_rent', '3d', 340, true, 'outflow'),
  ('c0000000-0000-0000-0000-000000000024', 'c0000000-0000-0000-0000-000000000003', 'Supplier Batch Payments (AP)', 'outflows_ap', '3e', 350, true, 'outflow')
on conflict do nothing;

-- Forecast Periods: generate 52 weeks from 2026-03-27
insert into forecast_periods (week_ending)
select ('2026-03-27'::date + (n * 7))::date
from generate_series(0, 51) as n
on conflict do nothing;

-- Default scenarios
insert into scenarios (id, name, description, is_default) values
  ('s0000000-0000-0000-0000-000000000001', 'Base Case', 'Pipeline at stated confidence, all recurring rules active', true),
  ('s0000000-0000-0000-0000-000000000002', 'Best Case', 'Pipeline bumped to 90%, speculative items included', false),
  ('s0000000-0000-0000-0000-000000000003', 'Worst Case', 'Pipeline dropped to 30%, unconfirmed items removed', false)
on conflict do nothing;

-- Intercompany (from Excel Section 7, as at 15 Jul 2025)
insert into intercompany_balances (from_group_id, to_group_id, description, amount, as_at_date) values
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'AP owed to AUG', 287069, '2025-07-15'),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'AP owed to CNR', 577353, '2025-07-15')
on conflict do nothing;

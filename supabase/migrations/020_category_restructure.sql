-- 020_category_restructure.sql
-- Yasmine feedback round 2 (Group 1): category restructure + pipeline entity flag
-- - Drops the legacy GST (Net) category (fresh start per user direction)
-- - Renames 'Direct Debits & Fixed Overheads' display name to 'Fixed Overheads' (code stays outflows_dd)
-- - Adds new inflow / outflow / loan sub-categories
-- - Adds nested 'Third Party Supplier Costs' under AP
-- - Deletes existing pipeline-sourced AR lines so the next sync re-emits them under the new Revenue Tracker category
-- - Adds entities.is_pipeline_entity column and flips AGC / ENT to false

BEGIN;

-- A. Drop the legacy GST (Net) category (fresh start)
DELETE FROM forecast_lines WHERE category_id = 'c0000000-0000-0000-0000-000000000012';
DELETE FROM categories WHERE id = 'c0000000-0000-0000-0000-000000000012';

-- B. Rename display name only; keep code = 'outflows_dd'
UPDATE categories SET name = 'Fixed Overheads' WHERE code = 'outflows_dd';

-- C. Add new categories under Operating Inflows (parent c0000000-...-0002)
INSERT INTO categories (id, parent_id, name, code, section_number, sort_order, is_system, flow_direction) VALUES
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000002', 'GST Refund',                      'inflows_gst_refund',       '2c', 230, false, 'inflow'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000002', 'Confirmed Revenue (Revenue Tracker)', 'inflows_revenue_tracker', '2d', 240, false, 'inflow');

-- C (cont). Add new categories under Operating Outflows (parent c0000000-...-0003)
INSERT INTO categories (id, parent_id, name, code, section_number, sort_order, is_system, flow_direction) VALUES
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000003', 'Contractors',  'outflows_contractors',  '3b', 315, false, 'outflow'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000003', 'GST Payment',  'outflows_gst_payment',  '3f', 355, false, 'outflow'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000003', 'Credit Cards', 'outflows_credit_cards', '3h', 365, false, 'outflow');

-- C (cont). Add new categories under Loans & Financing (parent c0000000-...-0004)
INSERT INTO categories (id, parent_id, name, code, section_number, sort_order, is_system, flow_direction) VALUES
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000004', 'BNZ Loan',                 'loans_bnz',         '4c', 430, false, 'outflow'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000004', 'Loan OD & Interest Fees',  'loans_od_interest', '4d', 440, false, 'outflow');

-- D. Nested third-party supplier costs under AP (resolve parent id via lookup)
INSERT INTO categories (id, parent_id, name, code, section_number, sort_order, is_system, flow_direction)
SELECT gen_random_uuid(), id, 'Third Party Supplier Costs', 'outflows_ap_third_party', '3i.1', 355, false, 'outflow'
FROM categories WHERE code = 'outflows_ap';

-- E. Delete existing pipeline-sourced AR lines. Next sync re-emits them under the new Revenue Tracker category.
DELETE FROM forecast_lines
WHERE source = 'pipeline'
  AND category_id = 'c0000000-0000-0000-0000-000000000010';

-- F. Add is_pipeline_entity column; flip AGC and ENT to non-pipeline.
ALTER TABLE entities ADD COLUMN is_pipeline_entity boolean NOT NULL DEFAULT true;
UPDATE entities SET is_pipeline_entity = false WHERE code IN ('AGC', 'ENT');

COMMIT;

-- 017_pipeline_seed.sql
-- Seed FY2027 revenue targets from Agency Revenue Tracker Excel

DO $$
DECLARE
  v_aug_id uuid;
  v_cnr_id uuid;
  v_bal_id uuid;
  v_dd_id uuid;
  v_wrs_id uuid;
  v_months text[] := ARRAY[
    '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01',
    '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01',
    '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01'
  ];
  v_month text;
BEGIN
  SELECT id INTO v_aug_id FROM entities WHERE code = 'AUG';
  SELECT id INTO v_cnr_id FROM entities WHERE code = 'CNR';
  SELECT id INTO v_bal_id FROM entities WHERE code = 'BAL';
  SELECT id INTO v_dd_id FROM entities WHERE code = 'DD';
  SELECT id INTO v_wrs_id FROM entities WHERE code = 'WRS';

  -- Augusto: $325,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_aug_id, v_month::date, 325000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Cornerstore: $150,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_cnr_id, v_month::date, 150000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Ballyhoo: $25,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_bal_id, v_month::date, 25000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Dark Doris: $25,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_dd_id, v_month::date, 25000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Wrestler: $25,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_wrs_id, v_month::date, 25000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;
END $$;

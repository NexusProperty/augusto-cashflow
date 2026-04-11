-- Add account number to bank_accounts for display
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_number text;

-- Add bank_account_id to forecast_lines
ALTER TABLE forecast_lines ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES bank_accounts(id);

-- Deactivate irrelevant accounts (sub-accounts, zero-balance, non-everyday)
UPDATE bank_accounts SET is_active = false WHERE name IN ('AUG Euro Account', 'AUG Production (DIRAFT)', 'AUG Staff Payments', 'DD2', 'DD5');

-- Update account numbers and names to match BNZ
UPDATE bank_accounts SET account_number = '02-0108-0892725-000' WHERE id = '8514a732-4dfe-400a-bcac-64c2fbecbc4a';
UPDATE bank_accounts SET account_number = '02-0108-0436455-000', name = 'Augusto Current' WHERE id = '77bf5487-0eb0-4e33-98d2-b3937463e191';
UPDATE bank_accounts SET account_number = '02-0108-0470530-000' WHERE id = '31dbdbdf-3319-4e21-93d5-5b3fc75e9fab';
UPDATE bank_accounts SET account_number = '02-0108-0436551-000' WHERE id = 'd43d85ab-96b0-4e47-94a3-00bc7c7b9050';
UPDATE bank_accounts SET account_number = '02-0108-0546291-000', name = 'Dark Doris (Nets)' WHERE id = '8dd072b3-f1e8-4239-a9bd-474836343314';

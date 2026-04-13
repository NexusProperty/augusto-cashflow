-- Per-bank opening balances feature: store week-1 opening on bank_accounts
-- and backfill untagged forecast_lines to Augusto Current.

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0 NOT NULL;

-- Backfill: route any untagged forecast_lines to Augusto Current (the
-- canonical OD account). After this, every forecast_line should have a
-- non-null bank_account_id.
UPDATE forecast_lines
SET bank_account_id = (
  SELECT id FROM bank_accounts WHERE name = 'Augusto Current' LIMIT 1
)
WHERE bank_account_id IS NULL;

-- Wipe legacy balance-direction forecast_lines. The OPENING BANK BALANCE
-- section is now driven by bank_accounts.opening_balance, not by lines.
DELETE FROM forecast_lines
WHERE category_id IN (
  SELECT id FROM categories WHERE flow_direction = 'balance'
);

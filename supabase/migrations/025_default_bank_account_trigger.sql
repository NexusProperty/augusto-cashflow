-- Close the NULL bank_account_id gap: any insert/update with a NULL
-- bank_account_id is routed to the canonical default (Augusto Current).
-- This is resilient to insert-path code drift (addForecastLine,
-- bulkAddForecastLines, updateLineAmounts, document processing,
-- recurring materialization, pipeline sync).

CREATE OR REPLACE FUNCTION public.set_default_bank_account()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  default_id uuid;
BEGIN
  IF NEW.bank_account_id IS NULL THEN
    SELECT id INTO default_id
    FROM bank_accounts
    WHERE name = 'Augusto Current'
      AND is_active = true
    LIMIT 1;

    IF default_id IS NOT NULL THEN
      NEW.bank_account_id := default_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecast_lines_set_default_bank ON forecast_lines;

CREATE TRIGGER forecast_lines_set_default_bank
BEFORE INSERT OR UPDATE OF bank_account_id ON forecast_lines
FOR EACH ROW
EXECUTE FUNCTION public.set_default_bank_account();

-- Re-backfill any rows that snuck in between migration 024 and now.
UPDATE forecast_lines
SET bank_account_id = (
  SELECT id FROM bank_accounts WHERE name = 'Augusto Current' AND is_active = true LIMIT 1
)
WHERE bank_account_id IS NULL;

-- Now enforce NOT NULL since the trigger guarantees it.
ALTER TABLE forecast_lines
  ALTER COLUMN bank_account_id SET NOT NULL;

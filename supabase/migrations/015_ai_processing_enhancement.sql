-- Add AI suggestion columns to document_extractions
ALTER TABLE document_extractions
  ADD COLUMN IF NOT EXISTS suggested_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_period_id uuid REFERENCES forecast_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_status text,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS auto_confirmed boolean NOT NULL DEFAULT false;

-- Index for fetching auto-confirmed items by document
CREATE INDEX idx_document_extractions_auto_confirmed
  ON document_extractions(auto_confirmed) WHERE auto_confirmed = true;

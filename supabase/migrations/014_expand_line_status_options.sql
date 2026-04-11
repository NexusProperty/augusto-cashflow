ALTER TABLE forecast_lines DROP CONSTRAINT IF EXISTS forecast_lines_line_status_check;
ALTER TABLE forecast_lines ALTER COLUMN line_status SET DEFAULT 'none';
ALTER TABLE forecast_lines ADD CONSTRAINT forecast_lines_line_status_check
  CHECK (line_status IN ('none', 'confirmed', 'tbc', 'awaiting_payment', 'paid', 'remittance_received', 'speculative', 'awaiting_budget_approval'));
UPDATE forecast_lines SET line_status = 'none' WHERE line_status = 'confirmed';

ALTER TABLE forecast_lines ADD COLUMN IF NOT EXISTS line_status text NOT NULL DEFAULT 'confirmed' CHECK (line_status IN ('confirmed', 'tbc'));

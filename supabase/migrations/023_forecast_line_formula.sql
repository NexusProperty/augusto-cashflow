-- Migration 023 — Add formula column to forecast_lines
--
-- Allows forecast lines to store an optional formula expression (e.g. =SUM(W3:W6)).
-- When formula is present, the amount column holds the last evaluated result.
-- The formula column is nullable; existing rows are unaffected.
-- No index is added (formulas are rare; full-table reads always include amount).
-- RLS is inherited from the forecast_lines table — no changes needed.

begin;

ALTER TABLE public.forecast_lines
  ADD COLUMN formula text;

COMMENT ON COLUMN public.forecast_lines.formula IS
  'Optional formula expression (e.g. =SUM(W3:W6)). When present, amount is the last evaluated result.';

commit;

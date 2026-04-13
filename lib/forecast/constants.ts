/**
 * Shared constants for the main-group cash-flow forecast view.
 * The migration backfill, engine fallback, and Section 1 UI all read from
 * here so that the canonical default bank and the render order of the
 * per-bank breakdown stay in a single source of truth.
 */

export const DEFAULT_BANK_NAME = 'Augusto Current'

// Order = render order in Section 1 of the detail grid.
export const MAIN_FORECAST_BANK_NAMES = [
  'Augusto Current',
  'Cornerstore',
  'Augusto Commercial',
  'Dark Doris (Nets)',
] as const

export type MainForecastBankName = (typeof MAIN_FORECAST_BANK_NAMES)[number]

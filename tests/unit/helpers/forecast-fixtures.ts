/**
 * Canonical forecast fixture factory shared across unit tests.
 *
 * Import mkForecastLine and override only the fields your test cares about.
 * All fields that are required by the ForecastLine interface have sensible
 * defaults so tests stay concise.
 */

import type { ForecastLine, Period } from '@/lib/types'

export function mkForecastLine(overrides: Partial<ForecastLine> = {}): ForecastLine {
  return {
    id: `line-${Math.random().toString(36).slice(2)}`,
    entityId: 'entity-1',
    categoryId: 'cat-1',
    periodId: 'period-0',
    amount: 100,
    confidence: 100,
    source: 'manual',
    counterparty: null,
    notes: null,
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'none',
    formula: null,
    ...overrides,
  }
}

export function mkPeriod(idx: number): Period {
  return {
    id: `p${idx}`,
    weekEnding: `2026-01-${String(idx + 1).padStart(2, '0')}`,
    isActual: false,
  }
}

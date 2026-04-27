# Analytics Plan - Augusto

> **What we measure, why, and who owns it.** Module 7. Handoff gate enforced.

**Project:** `augusto-cashflow`

---

> **Honest scope.** Augusto cashflow is a single-operator internal tool — no funnel analytics, no cohort analysis, no growth dashboards. This plan is **operational telemetry only**: counters and rates that tell Jack whether the build is working day-to-day. Product analytics is N/A; the rows below reflect that.

## Events

| Event | Fired when | Properties | Source surface | Status |
|---|---|---|---|---|
| `documents_extract_completed` | OpenRouter call returns 200 + parsed payload validates | `documentId, lineCount, latencyMs` | `supabase/functions/process-document/` | Deferred (needs logger — REALITY-GAP row 3) |
| `documents_extract_failed` | OpenRouter call non-200 OR Zod validation throws | `documentId, errorClass, latencyMs` | same | Deferred |
| `documents_confirmed` | User confirms extracted lines into the forecast | `documentId, lineCount, scenarioId` | `app/(app)/documents/actions.ts` | Deferred |
| `forecast_cell_save_succeeded` | Server Action commits a forecast_line edit | `forecastLineId, weekIndex, source ('grid'\|'paste'\|'fill')` | `app/(app)/forecast/actions.ts` | Deferred |
| `forecast_cell_save_failed` | Server Action returns error | `forecastLineId, errorClass` | same | Deferred |

All events are **deferred until the logger lands** (REALITY-GAP row 3). They form the contract the logger should emit.

## KPIs

| KPI | Definition | Target | Current measurement | Owner |
|---|---|---|---|---|
| Doc-extract success rate | `documents_extract_completed / (completed + failed)` over 30 days | ≥ 95% | None — count manually from Vercel function logs in the meantime | Jack |
| Forecast save reliability | `forecast_cell_save_succeeded / (succeeded + failed)` over 30 days | ≥ 99% | None — user reports "Save failed" toast spikes | Jack |
| Time-to-confirm | Median minutes from doc upload to `documents_confirmed` | ≤ 5 min | None | Jack |

Product KPIs (signups, activation, WAU) are **N/A** for a single-operator build.

## Ownership

| Concern | Owner | Review cadence |
|---|---|---|
| Event QA (verify events fire correctly when added) | Jack | Once at logger-install milestone, then ad-hoc |
| KPI tracking | Jack | Monthly review (e.g., first Monday) |
| Tracking plan updates (this doc) | Jack | When a new measurable event ships |

---

## Cross-references

- Observability (event sinks): `docs/OBSERVABILITY.md`
- Production-readiness gate: `docs/PRODUCTION_READINESS.md` Module 7

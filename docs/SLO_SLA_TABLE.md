# SLO and SLA - Augusto

> What we promise, what triggers escalation. Pair with `docs/PERFORMANCE_BUDGET.md`.

**Project:** `augusto-cashflow`

---

## SLOs

All achievement columns are `TBD — measurement not yet wired` until logger + Sentry land (REALITY-GAP row 3). Targets below are what the build commits to once measurement is in place.

| Surface | SLI | Target (rolling 30d) | Achievement | Measurement source (target) |
|---|---|---|---|---|
| Dashboard availability | (HTTP 2xx + 3xx) / total requests | ≥ 99% | TBD | Vercel function logs aggregated by drain |
| Forecast Server Action success | Non-error responses / total | ≥ 99% | TBD | `forecast.cell_save_*` events → Sentry |
| Document-extract success | `documents_extract_completed / (completed + failed)` | ≥ 95% | TBD | `documents_extract_*` events → Sentry |
| Forecast detail grid first paint p95 | p95 time-to-interactive | ≤ 1.5s | TBD | Sentry browser performance |

## Error budgets

| Surface | Monthly budget | Burn-rate alert | Owner action |
|---|---|---|---|
| Dashboard availability | 7.2 hours/month down (1% of 30d) | Alert at 50% burn (3.6h) within first 7 days | Pause non-essential changes; investigate |
| Document-extract failures | 5% of attempts (per the 95% target) | Alert if >2% in any 24h window | Check OpenRouter status; check key validity; check rate-limit (REALITY-GAP row 4) |
| Forecast save failures | 1% of attempts | Alert if >0.5% in any 24h window | Replay failing actions; check Supabase status; check schema drift |

## SLAs (external commitments)

| Customer | SLA | Penalty | Owner |
|---|---|---|---|
| N/A — internal Augusto build | — | — | — |

Augusto cashflow is an internal tool delivered by Mission Control (jackchen1321 / NexusProperty) to Augusto. No third-party SLA exists. Internal expectation: best-effort 99% availability during NZ business hours; off-hours best-effort.

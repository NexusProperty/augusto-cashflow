# Performance Budget - Augusto

> Module 6. Caps aspirational; SLOs in `docs/SLO_SLA_TABLE.md` are contractual.

**Project:** `augusto-cashflow`

---

## Latency budgets

All targets are **aspirational** at this stage (no measurement infra wired — REALITY-GAP row 3). Numbers below are the budgets the build SHOULD meet at production data volumes (5+ entities × 52 weeks × ~30 line items per week).

| Surface | p50 target | p95 target | p99 target | Hard cap |
|---|---|---|---|---|
| Forecast detail grid first paint | 700ms | 1.5s | 2.5s | 4s |
| Forecast cell-edit-to-save round-trip | 200ms | 500ms | 800ms | 2s |
| Forecast bulk save (TSV paste, ~100 rows) | 400ms | 800ms | 1.5s | 5s |
| Documents page first paint | 500ms | 1s | 1.5s | 3s |
| Doc-extract round-trip (OpenRouter end-to-end) | 4s | 8s | 12s | 20s |
| Pipeline page first paint | 500ms | 1s | 1.5s | 3s |
| Settings page first paint | 300ms | 700ms | 1s | 2s |
| Webhook receivers | n/a | n/a | n/a | n/a (no webhooks) |

## AI cost ceilings

| Concern | Limit | Source | Action on breach |
|---|---|---|---|
| Monthly OpenRouter spend | **$50/mo (placeholder — confirm with Augusto stakeholder)** | OpenRouter dashboard | Email notification to Jack; investigate spend pattern; consider monthly model downgrade if persistent |
| Per-document extraction cost | ≤ $0.50/document (typical Augusto doc is 1-3 pages, ~5-10k input tokens) | OpenRouter usage page | If average per-doc cost exceeds $0.50, audit prompt + model choice |
| Per-user monthly cap | n/a — single user | n/a | n/a |

**Note:** `lib/ai-routing/cost-tracker.ts` is referenced in MC's template but does not exist in this build. Augusto cost tracking is manual (monthly OpenRouter dashboard review) until an Augusto-internal cost helper is added.

## Regression gates

| Gate | Where | Threshold | Status |
|---|---|---|---|
| Bundle size (Next.js client JS) | CI | < 500 KB gzipped first-load | Not enforced — would need `@next/bundle-analyzer` + a CI step |
| Lighthouse performance score | CI | ≥ 80 (mobile, throttled) | Not enforced — would need Lighthouse CI on a seeded fixture |
| `test:perf` p95 | `npm run test:perf` | Per latency budgets above | Not wired — script exists; no specs |

**All regression gates are deferred per `REALITY-GAP.md` row 5.** Owner: Jack. Target: 2026-06-05.

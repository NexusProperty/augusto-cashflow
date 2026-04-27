# Observability - Augusto

> **Logs, metrics, alerts, owners.** Production hardening Module 3. The handoff gate fails if any row still says `TODO: fill before handoff`.

**Project:** `augusto-cashflow` · **Created:** 2026-04-28

---

> **Honest scope.** As of 2026-04-28 this build has NO `lib/logger.ts`, NO Sentry SDK initialized, NO `instrumentation.ts`. This document catalogues the **current** posture (mostly absent) and names the **target** posture against which `REALITY-GAP.md` row 3 is owned. Treat every row marked `Deferred (REALITY-GAP row 3)` as **handoff-blocking debt** — it does not block development but it blocks safe production operation under a meaningful incident.

## Logs

| Concern | Current detail | Target detail |
|---|---|---|
| Structured logger | None — Server Actions emit ad-hoc `console.log` lines, visible only in Vercel function logs. No `lib/logger.ts`. | `lib/logger.ts` (pino) with required fields `event`, `userId`, `documentId/forecastLineId`, `latency_ms`, `err`. Used at every Server Action success + failure path. |
| Required fields | n/a (no logger) | `event` (snake_case verb_noun), `userId` (Supabase auth uid), `latency_ms`, `err` (Error.stack on failure) |
| Sensitive-field redaction | n/a (no logger) | Pino redact paths: `[*.password, *.api_key, *.OPENROUTER_API_KEY, req.headers.cookie]`. PII (forecast amounts, business names) is NOT redacted — operationally necessary for triage. |
| Sink (production) | Vercel function logs only — 15-day retention, JSON-structured-only at the Vercel layer | Vercel + a log drain (Better Stack or Axiom) configured via Vercel integrations dashboard. 30-day retention minimum. |
| Retention | 15 days (Vercel default) | 30 days drain + 1 year cold (S3-glacier-equivalent for accounting audit) |

**Status: Deferred (REALITY-GAP row 3).** Owner: Jack. Target: 2026-05-29.

## Metrics

| Surface | Metric | Current source | Target |
|---|---|---|---|
| Server Actions | p95 latency | None tracked | Sentry transactions tagged `forecast.save`, `documents.extract`, `documents.confirm`. p95 ≤ 800ms target except `documents.extract` (≤ 10s). |
| `app/api/documents/extract` (OpenRouter call) | success rate | None tracked | Sentry custom event `documents_extract_completed`/`documents_extract_failed`. Target ≥ 95% success. |
| AI calls | cost / day | None tracked (`lib/ai-routing/cost-tracker.ts` is an MC-only module not present in this client) | Manual: monthly OpenRouter dashboard review. **Add Augusto-internal cost tracker in a follow-up sprint.** |
| Forecast detail grid | save failure rate | Visible in toast UI; not aggregated | Sentry tag `forecast.cell_save_failed`; alert at >1%/10min. |

**Status: Deferred (REALITY-GAP row 3).** Owner: Jack. Target: 2026-05-29.

## Alerts

| Alert | Trigger | Channel | Owner |
|---|---|---|---|
| forecast_save_error_spike | `forecast.cell_save_failed` events > 1%/10min OR > 5 events/1min | Email to jack@nexusproperty.co.nz | Jack |
| documents_extract_error_spike | `documents_extract_failed` events > 5%/10min | Email to jack@nexusproperty.co.nz | Jack |
| openrouter_unauthorized | `documents_extract_failed` event with status 401 (any single occurrence) | Email + on-screen banner suggesting key rotation | Jack |

**Status: Deferred (REALITY-GAP row 3).** None of these alerts are wired today; they require the logger + Sentry init from the same row.

## Owners and on-call

| Surface | Primary | Secondary | Escalation |
|---|---|---|---|
| All Augusto cashflow surfaces | Jack | (none — single-developer build) | OpenRouter status page; Supabase status page |

Augusto cashflow is a single-operator build. There is no rotation. When Jack is unavailable, alerts fall through to email + the user reports them on next login. This is documented openly so any future second-operator onboarding starts with the right expectation.

---

## Cross-references

- Runbooks: `docs/RUNBOOKS.md`
- SLO/SLA: `docs/SLO_SLA_TABLE.md`
- Security: `docs/SECURITY_BASELINE.md`

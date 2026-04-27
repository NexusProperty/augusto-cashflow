# Reality Gap - Augusto

> **Pre-handoff diagnostic.** Each row maps a prototype default to the production requirement this build commits to, with owner + target. Filled rows are checked by the prepare-handoff gate; unfilled-row sentinels block the gate.

This document records the anti-patterns this build deliberately addressed before delivery. It is the cheapest possible Module-0/4/5 review gate from the prodblueprint.dev framework.

| Domain | Prototype default | Production requirement (this build) | Owner | Target |
|---|---|---|---|---|
| **Validation** | Server Actions in `app/(app)/documents/` accept user-uploaded files and pass them straight to the OpenRouter document extractor without enforced size cap or MIME-type allowlist at the action boundary. The Supabase Storage layer applies a global file-size limit, but no Zod schema validates extension/MIME at the action. | Add a Zod schema at the boundary of every `documents/` Server Action that validates `{ filename, mimeType, sizeBytes }` against a kept allowlist (xlsx, csv, pdf, docx) and rejects anything else with a 400-level result. Cap at 10 MB until measured otherwise. | Jack | 2026-05-15 |
| **Workflows** | The AI doc-extract → user confirm → forecast insert chain has no idempotency token. If a user double-clicks "Confirm extracted lines", two sets of forecast lines insert because the confirm action does not check whether this `(document_id, extracted_line_hash)` pair has already been written. | Derive an idempotency key from `(document_id, sha1(extracted_payload))`. The forecast-insert action uses upsert keyed on `(document_id, line_hash)` so a duplicate confirm is a no-op. UI button additionally guards with a per-document `isConfirming` flag. | Jack | 2026-05-22 |
| **Observability** | No `lib/logger.ts` exists; no Sentry SDK initialized; no `instrumentation.ts`. Errors are visible only in the browser console, in `console.log` lines emitted by Server Actions, and in Vercel function logs (15-day retention). Production failure modes that the user does NOT see (silent retries, dropped requests, stuck save-status chips) are unobserved. This is **handoff-blocking debt** — see `docs/glossary.md` in Mission Control. | Add `lib/logger.ts` (pino, structured) with required fields `event`, `userId`, `documentId/forecastLineId where relevant`. Initialize Sentry with `NEXT_PUBLIC_SENTRY_DSN` env-gated. Tag releases via Vercel git env. Wire alerts on `*_failed` event spike (>2%/10min). Documented in `docs/OBSERVABILITY.md`. | Jack | 2026-05-29 |
| **Security** | OpenRouter API key is stored as a single-tenant Vercel env var (`OPENROUTER_API_KEY`); no BYOK path; no documented rotation cadence. A leaked key would cost the project until manually rotated. Supabase RLS exists on the data tables but `app/api/documents/extract/route.ts` (the OpenRouter call) has no rate limit, so a credential leak combined with a leaked APP_URL would let a third party drive cost up. | Document quarterly OPENROUTER_API_KEY rotation cadence in `docs/SECURITY_BASELINE.md` with a calendar reminder. Add a per-IP rate-limit (10 doc-extract/min) on `app/api/documents/extract/route.ts` so a leak has a bounded blast radius. Track rotation events in a row of the same baseline doc. | Jack | 2026-05-15 |
| **Performance** | Forecast detail grid (`app/(app)/forecast/detail/page.tsx`) renders the full 52-week × all-rows matrix on page load; no row windowing, no week pagination, no React `memo` on cell components. At small data volumes (one or two entities) this is fine; at production volume (5+ entities × 52 weeks × ~30 line items) interactive latency has not been measured. | Measure p95 first-paint and edit-commit latency at production volume. If p95 first-paint > 1.5s OR p95 cell-edit-to-save > 800ms, add row windowing (react-virtual) AND `React.memo` on the cell component. Add a perf budget row in `docs/PERFORMANCE_BUDGET.md` and gate it in CI via Lighthouse CI on a seeded fixture. | Jack | 2026-06-05 |

## Filling Guidance

- **Validation** - what input is sanitized at every server-action / API boundary? Cite the Zod schemas or equivalent.
- **Workflows** - which long-running processes have idempotency keys, retries, and dead-letter handling?
- **Observability** - what's the logger contract? Reference structured fields, alert routing, and `lib/logger.ts`.
- **Security** - RBAC model, server-side validation, and secret-handling pattern.
- **Performance** - N+1 prevention, caching strategy, AI cost ceiling, and p95 latency target.

## Cross-References

- Build: `docs/system-formation/01-build-spec.md`
- Runbook: `docs/system-formation/04-runbook.md`
- Scaling: `docs/system-formation/05-scaling-path.md`

# 05 - Scaling Path: Augusto

**Project slug:** `augusto-cashflow`
**Created:** 2026-04-28

This document names the additions that are intentionally NOT in the first build, the trigger that justifies each addition, and the rough cost class. Listing them keeps the first build small and prevents surprise scope creep later.

---

## Single-operator → Multi-operator

**Trigger:** A second person needs to edit the forecast (not just view).

**Cost class:** Medium (~3-5 days)

**What it requires:**
1. Realtime collaboration: Supabase Realtime channel on `forecast_lines` so the second editor sees in-flight changes
2. Conflict resolution: detect overlapping edits at cell level; fall back to last-write-wins with a banner showing "[name] overwrote your edit"
3. Audit log: SECURITY_BASELINE.md "Audit log" gap closes — every forecast_line edit records `who, when, before, after`
4. Optimistic UI rollback: today the grid optimistically commits then rolls back on failure; with two editors, rollback needs to also handle remote-conflict events

**Status today:** N/A — single user. Last-write-wins is acceptable.

---

## Centralized observability

**Trigger:** Any incident lasts > 30 min with unclear cause; OR any "Save failed" report goes uninvestigated.

**Cost class:** Small (1-2 days for logger + Sentry; another 1d for alert wiring)

**What it requires:**
1. `lib/logger.ts` (pino) with structured fields per OBSERVABILITY.md
2. Sentry SDK init + `instrumentation.ts`; DSN env-gated
3. Vercel log drain (Better Stack or Axiom) — 30-day retention
4. Alerts wired per OBSERVABILITY.md (forecast_save_error_spike, documents_extract_error_spike, openrouter_unauthorized)

**Status today:** Deferred per REALITY-GAP row 3. Owner: Jack. Target: 2026-05-29.

---

## Integration test suite

**Trigger:** First mutating Server Action regression in production that unit tests would have missed.

**Cost class:** Small (~1d for the harness + first test) + ongoing as new actions land

**What it requires:**
1. `vitest.integration.config.ts` — separate config pointing at `tests/integration/`
2. CI step bringing up local Supabase before running the layer
3. First test: `documents.confirm` action → verify forecast_lines insert + idempotency token rejects double-confirm

**Status today:** Stub at `tests/integration/README.md`. Per TEST_STRATEGY.md Integration row.

---

## E2E test suite (Playwright)

**Trigger:** First browser-only regression in production (e.g., grid keyboard shortcut breaks).

**Cost class:** Medium (~2d for the harness + 3 happy-path specs)

**What it requires:**
1. Playwright config + npx playwright install
2. Three specs covering the canonical user journeys (login → upload → extract → confirm; paste TSV → save → reload; pipeline confirm → forecast auto-update)
3. Test data seeding in CI

**Status today:** `test:e2e` script exists; no specs. Per TEST_STRATEGY.md.

---

## Per-document cost tracking

**Trigger:** Monthly OpenRouter spend exceeds $50 OR per-doc cost spikes.

**Cost class:** Small (~half-day)

**What it requires:**
1. Augusto-internal `lib/cost-tracker.ts` (the MC version doesn't ship in this client)
2. Hook the cost into the document row after extraction so the operator sees per-doc cost in the UI
3. Aggregate monthly cost in a settings page or simple dashboard

**Status today:** Manual — review OpenRouter dashboard monthly per `04-runbook.md`.

---

## Multi-tenancy (multiple Augusto-like clients)

**Trigger:** A different organization wants to use this app.

**Cost class:** Large (~2 weeks). Augusto cashflow is built single-tenant. Multi-tenancy requires:

1. Tenant scoping on every table (currently `entity_groups` is the closest thing to a tenant boundary; would need a new `tenants` parent)
2. RLS rewrite for tenant-aware policies
3. Tenant-aware sign-up + invite flow
4. Per-tenant OpenRouter key (BYOK pattern from MC's `lib/resolve-api-key.ts`)
5. Per-tenant cost tracking
6. UI affordances for tenant switching

**Status today:** Out of scope. If this trigger fires, the right answer is probably to fork from MC's full multi-tenant scaffold rather than retrofit Augusto cashflow.

---

## Realtime multi-window sync

**Trigger:** Same operator wants to edit the forecast across two browser windows simultaneously.

**Cost class:** Small (~1d) — but only valuable if multi-operator support is also in.

Sub-case of "Single → Multi-operator" above.

---

## Excel export (full XLSX)

**Trigger:** Operator/CFO requests a workbook download with formatting.

**Cost class:** Small (~half-day) — `exceljs` is already a dep.

**What it requires:** A Server Action that builds an XLSX from current forecast lines + scenarios; client downloads via blob. Already mostly covered by existing CSV export; the gap is the formatting layer.

**Status today:** Not requested. Don't pre-build.

---

## When NOT to scale

A pattern: every entry above has a *trigger*. If the trigger has not fired, the pattern is not yet earning its complexity. Augusto cashflow is intentionally small — keep it that way until the trigger is real.

---

## Cross-references

- Reality Gap: `REALITY-GAP.md`
- Test strategy: `docs/TEST_STRATEGY.md`
- Security baseline: `docs/SECURITY_BASELINE.md`

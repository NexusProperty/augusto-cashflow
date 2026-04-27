# Test Strategy - Augusto

> Module 5 mapping. Every test layer has a runner, a coverage scope, and an owner.

**Project:** `augusto-cashflow`

---

## Unit ✅ COVERED

| Concern | Detail |
|---|---|
| Runner | Vitest (`npm run test:unit`) |
| Scope | Forecast engine (`lib/forecast/`), document extraction schemas, clipboard/TSV helpers, formula evaluation, fill-handle behaviour, dep-graph, formatting helpers, pipeline filters, scenario/override math |
| Existing files | 19 specs in `tests/unit/`: aggregates, alerts, bulk-confirm, clipboard-tsv, dep-graph, export, extraction-prompt, extraction-schema, fill-handle, find, flat-rows, forecast-engine, forecast-grid-state, format-currency, formula, inline-cell-keyboard, per-bank-engine, pipeline-entity-filter, pipeline-excel-import |
| Coverage target | ≥80% on the forecast/pipeline/documents modules — measured via `npm run test:coverage` |
| Coverage threshold enforced in `vitest.config.ts`? | ❌ Not yet. **Add `coverage.thresholds` in a follow-up sprint.** |
| Mock policy | Mocks for OpenRouter/Supabase IO; no mocks for `lib/forecast/`, `lib/pipeline/`, or pure helpers |

## Integration ❌ GAPPED — handoff-blocking debt

| Concern | Detail |
|---|---|
| Runner | Vitest (`npm run test:integration`) — script added to `package.json` 2026-04-28 |
| Scope (target) | Every Server Action that mutates state — `forecast/actions.ts`, `documents/actions.ts`, scenario overrides, recurring rules |
| Required envs | `.env.test.local` with local Supabase URL + anon + service-role keys |
| Required config file | `vitest.integration.config.ts` — **does not exist.** Adding the script without the config means the script will fail loudly on first invocation; that's intentional (see `tests/integration/README.md`). |
| Mock policy (target) | Mocks forbidden for Supabase client — per Mission Control project rule "integration tests hit real Supabase, NOT mocks" |
| Current state | `tests/integration/` exists as an empty stub. No specs, no config. |
| Owner | Jack |
| Target | First spec ships before any new mutating Server Action lands; current Server Actions backfilled by 2026-06-30 |

## End-to-end ❌ GAPPED

| Concern | Detail |
|---|---|
| Runner | Playwright (`npm run test:e2e`) — script exists; no specs |
| Scope (target) | Three happy paths: `(1)` login → upload Excel → AI extract → confirm → forecast updates · `(2)` forecast detail grid: paste TSV from Excel → save → reload → values persist · `(3)` pipeline: add project → mark confirmed → forecast Confirmed Revenue auto-populates |
| Smoke subset | None until any e2e test exists |
| Headless / headed | Headless in CI; headed locally via `npx playwright test --headed` |
| Owner | Jack |
| Target | Three happy-path specs by 2026-07-15 |

## Acceptance N/A

Augusto cashflow is a client repo, not a platform. Acceptance tests are a Mission-Control-internal concept (verifying scaffolder output). N/A here.

## Security ❌ NOT WIRED

| Concern | Detail |
|---|---|
| Runner | None — `npm run security:audit` is an MC-internal script, not present in this client |
| Recommended | Add `gitleaks` to `.github/workflows/ci.yml` for repo secret scan; add a manual quarterly RLS-probe test (anonymous SELECT against each user-data table, expect 0 rows) — track in `docs/SECURITY_BASELINE.md` |
| Cadence | Per PR (gitleaks) + quarterly (RLS probe) |
| Status | Not wired today. Acceptable for single-operator scope; document as gap in `REALITY-GAP.md` row 4 if not already covered. |

## Performance ❌ NOT WIRED

| Concern | Detail |
|---|---|
| Runner | `npm run test:perf` — script added 2026-04-28; no spec files yet |
| Targets | See `docs/PERFORMANCE_BUDGET.md` (forecast detail render p95 ≤ 1.5s; doc-extract p95 ≤ 10s; bulk save p95 ≤ 800ms) |
| Regression gate | None today. Recommended: Lighthouse CI gate on a seeded fixture in CI; budget regressions block merge. |
| Status | Deferred per `REALITY-GAP.md` row 5. Owner: Jack. Target: 2026-06-05. |

## UAT (User Acceptance Testing)

| Concern | Detail |
|---|---|
| Process | Augusto stakeholder (single user) walks through one weekly forecast cycle end-to-end on a staging deploy after each milestone |
| Sign-off owner | Augusto stakeholder (Daniel/equivalent — confirm on next handoff) |
| Artefact | Email or Slack message confirming "I ran the cycle and the numbers reconcile" — kept in shared notes |
| Cadence | After every milestone; at minimum quarterly |

---

## Cross-references

- Production-readiness gate: `docs/PRODUCTION_READINESS.md` Module 5
- Performance budget: `docs/PERFORMANCE_BUDGET.md`
- Reality Gap: `REALITY-GAP.md`

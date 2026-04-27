# Production Readiness - Augusto

> **Per-client hardening checklist.** Walks Modules 1-7 of the prodblueprint.dev framework. Every row is `TODO: fill before handoff` until the builder ticks it. The handoff gate fails if any sentinel remains.

**Project:** `augusto-cashflow` · **Created:** 2026-04-28 · **Starter pack:** `none (pre-Phase-1 scaffold; backfilled retroactively)`
**Enabled modules:** auth, documents, forecast, pipeline

---

## How to use

For each module: state the *production requirement* this build meets (not a generic best practice). Cite files, schemas, jobs, alerts, and tests. If a row does not apply, replace `TODO: fill before handoff` with `N/A - <reason>` and link to the design decision.

---

## Module 1 - System Architecture

| Item | Status |
|---|---|
| Feature spec lives in `docs/system-formation/01-build-spec.md` and is current | ✅ written 2026-04-28; sourced from HANDOFF.md |
| API surface enumerated in `docs/ARCHITECTURE.md` | ✅ enumerated 2026-04-28 (4 modules: auth, documents, forecast, pipeline) |
| Workflow diagrams + boundaries documented | ⚠️ Text-only in ARCHITECTURE.md; no diagrams. Acceptable for single-operator scope. |

## Module 2 - Data Reliability

| Item | Status |
|---|---|
| Schema design is in `supabase/migrations/` and is migration-first (no ad-hoc DB edits) | ✅ 25 numbered migrations under `supabase/migrations/` |
| Migrations are reversible OR have a documented forward-only rationale | ⚠️ Mixed. Early migrations (001-009) are not idempotent. Forward-only is the documented rationale (see `docs/RUNBOOKS.md` "Supabase migration failure"). |
| Integrity constraints (FKs, NOT NULL, CHECKs, RLS) cover every user-input table | ✅ Confirmed in `010_rls_policies.sql` (RLS) + per-table FKs in `001-009`; `021_db_integrity_fixes.sql` patched gaps |

## Module 3 - DevOps and Infra

| Item | Status |
|---|---|
| CI runs lint + typecheck + unit + integration on every PR | ⚠️ Lint + typecheck + unit only via `.github/workflows/ci.yml`. **Integration is gapped — `test:integration` script exists but `tests/integration/` is empty** (see `docs/TEST_STRATEGY.md`). |
| Logging contract (`lib/logger.ts`) used everywhere; no `console.log` in `app/` or `components/` | ❌ **Deferred (REALITY-GAP row 3).** No `lib/logger.ts`; Server Actions use `console.log`. Owner: Jack. Target: 2026-05-29. |
| Sentry DSN configured in production env; release tagging works | ❌ **Deferred (REALITY-GAP row 3).** No Sentry SDK; no `instrumentation.ts`. Same owner + target as above. |

## Module 4 - Security and Auth

| Item | Status |
|---|---|
| Every Server Action begins with `await requireAuth()` | ✅ `lib/auth.ts:requireAuth()` exists; spot-check `app/(app)/forecast/actions.ts` and `app/(app)/documents/actions.ts` confirms first-line usage |
| RBAC enforced via `requireRole()` where the surface is role-scoped | N/A — single-operator build, no role split. See `docs/SECURITY_BASELINE.md` "Authorization" |
| Secrets stored via Supabase Vault + BYOK; no plaintext secrets in repo | ⚠️ Supabase Vault NOT wired (gap vs MC pattern). Single-tenant Vercel env vars only. No BYOK. Acceptable for single-tenant scope; documented in `docs/SECURITY_BASELINE.md` |
| Webhook receivers HMAC-verified; rate-limited per-source | N/A — Augusto has no webhook receivers (OpenRouter is outbound-only). |
| OPENROUTER_API_KEY rotation cadence documented | ✅ Quarterly per `docs/SECURITY_BASELINE.md` and `docs/RUNBOOKS.md` |
| Doc-extract endpoint rate-limited | ❌ **Deferred (REALITY-GAP row 4).** Owner: Jack. Target: 2026-05-15. |

## Module 5 - Testing and Validation

| Item | Status |
|---|---|
| Unit test coverage for new modules >= 80% | ⚠️ Coverage threshold NOT enforced in `vitest.config.ts`. Existing `tests/unit/` covers forecast engine + utils. Spot-check estimate: ~50-60% lines. **Add coverage threshold post-handoff.** |
| At least one integration test per Server Action that mutates state | ❌ Zero integration tests. `tests/integration/` is an empty stub. See `docs/TEST_STRATEGY.md`. |
| At least one E2E happy-path test per dashboard page | ❌ `test:e2e` script exists; no Playwright specs written. See `docs/TEST_STRATEGY.md`. |

## Module 6 - Performance

| Item | Status |
|---|---|
| p95 latency target stated in `docs/SLO_SLA_TABLE.md` | ✅ Targets stated; achievement column marked `TBD — measurement not wired` per REALITY-GAP row 5 |
| AI cost ceiling stated in `docs/PERFORMANCE_BUDGET.md` | ⚠️ Placeholder budget ($50/mo for OpenRouter) pending stakeholder confirmation |
| Caching strategy documented for read-heavy surfaces | N/A — Augusto's read-heavy surface is the forecast detail grid which is data-fresh-on-load by design (no caching). |

## Module 7 - Analytics

| Item | Status |
|---|---|
| Tracking plan in `docs/ANALYTICS_PLAN.md` covers signup, activation, primary actions | ⚠️ Single-user scope. Plan documents only operational counters (doc-extract success rate, save failure rate). No product/funnel analytics. |
| KPIs + ownership listed | ✅ Two KPIs (doc-extract ≥95% success, save failure ≤1%) owned by Jack |
| Event QA process documented (how the builder verifies events fire) | N/A until logger lands (Module 3) |

---

## Cross-references

- Architecture: `docs/ARCHITECTURE.md`
- Observability: `docs/OBSERVABILITY.md`
- Security: `docs/SECURITY_BASELINE.md`
- Test strategy: `docs/TEST_STRATEGY.md`
- Reality Gap: `REALITY-GAP.md`

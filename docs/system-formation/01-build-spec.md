# 01 - Build Spec: Augusto

**Project slug:** `augusto-cashflow`
**Created:** 2026-04-28
**Starter pack:** `none (pre-Phase-1 scaffold; backfilled retroactively)`
**Enabled modules:** auth, documents, forecast, pipeline

This spec defines what the first governed build must prove, what it must not attempt, and which interfaces must stay stable as the project scales.

---

## 1. Vision

Replace Augusto's Excel-based 52-week group cash-flow forecast with a web app that (a) lets the finance operator update lines as fast as Excel does, (b) auto-derives forecast revenue/cost from a confirmed-projects pipeline, and (c) ingests source documents (payroll PDFs, invoice CSVs, bank statements) via AI extraction so manual re-keying drops by the bulk of the weekly effort. The build is verifiable by the operator running one full weekly forecast cycle inside the app and the resulting numbers reconciling against the prior Excel.

---

## 2. Scope

### 2.1 In Scope

- 52-week forward cash-flow forecast across the four canonical category sections (Opening Bank Balance, Operating Inflows, Operating Outflows, Loans & Financing) — see `HANDOFF.md` §Category structure
- Per-entity (AUG/CNR/BAL/DD/WRS active) breakdown with group rollup
- Per-bank opening balances and per-row bank chip assignment
- Excel-like editing in `/forecast/detail`: paste TSV from Excel, fill-handle, formula support (`=1500*4`, `=(5000+250)/2`)
- Scenarios (Base/Best/Worst) with per-item override at `/forecast/overrides`
- Pipeline tracker (`/pipeline`) with confidence-based projection into forecast Confirmed Revenue + Third Party Costs
- Document upload + AI extract + user-confirm workflow (`/documents`)
- Recurring rules (payroll, rent, PAYE) auto-generating forecast lines (configured in `/settings`)
- Single-user authentication via Supabase

### 2.2 Out of Scope

- Multi-user concurrent editing (single-operator; last-write-wins)
- Realtime collaboration (no Supabase Realtime channels)
- Billing module / invoicing / AR reminders
- Integration with Xero, MYOB, or any external accounting system
- Mobile-responsive UI (desktop-first)
- Multi-tenant SaaS — Augusto is single-tenant

### 2.3 Scaling Additions

| Addition | Trigger | Notes |
|---|---|---|
| Realtime collaboration | A second operator joins | See `05-scaling-path.md` for the Supabase Realtime decision and conflict-resolution outline |
| Centralized observability (logger + Sentry) | Any production incident lasts > 30 min OR any "Save failed" report goes uninvestigated | Per REALITY-GAP row 3; owner Jack target 2026-05-29 |
| Coverage threshold + integration tests | First mutating Server Action regression in production | Per TEST_STRATEGY.md gaps |

---

## 3. Architecture

### 3.1 Logical Pipeline

```text
User uploads doc (xlsx/csv/pdf/docx)
  -> Supabase Storage (auth-gated)
  -> /api/process-document (Edge Function — calls OpenRouter)
  -> Extracted JSON validated against extraction-schema.ts
  -> User reviews + confirms via /documents page
  -> Forecast lines inserted via Server Action (idempotency token: REALITY-GAP row 2)
  -> Forecast detail grid reflects new lines + recalculated subtotals
```

```text
Pipeline project marked "confirmed" by operator
  -> Pipeline → Forecast auto-derivation in lib/forecast/engine.ts
  -> Confirmed Revenue + Third Party Costs lines emitted, prorated across weeks
  -> Forecast detail shows the derived lines (read-only — must edit at the pipeline)
```

### 3.2 Components

| Component | First build form | Scale form |
|---|---|---|
| Intake (documents) | Supabase Storage + `/api/process-document` Edge Function | Add a queue + retry for OpenRouter failures (see RUNBOOKS.md "OpenRouter outage") |
| Data store | Supabase Postgres (25 migrations) | Add per-entity row-level partitioning if a single entity exceeds ~10k forecast lines |
| Business logic | Pure functions in `lib/forecast/engine.ts` (engine, aggregates, dep-graph) | Stays pure; add memoization if perf budget breaks |
| Review surface | `/documents` page for AI-extracted lines | Add bulk-confirm + diff-view-vs-prior-extraction |
| Audit log | None currently — see SECURITY_BASELINE.md "Audit log" gap | Required before multi-user |
| Reporting | Forecast detail grid + overview | Add scheduled Excel export + CSV download |

### 3.3 Stack Decisions

| Concern | Decision | Why |
|---|---|---|
| Runtime | Next.js 15 (App Router) on Vercel | Per ADR-001 (MC fork); Vercel Fluid Compute |
| Database | Supabase Postgres + Auth + Storage + Edge Functions (Deno) | Single vendor for auth/data/storage minimizes ops surface |
| Validation | Zod | Boundary safety on Server Actions and Edge Function inputs |
| Observability | **Deferred** — REALITY-GAP row 3. Currently `console.log` + Vercel function logs only. | See `docs/OBSERVABILITY.md` |
| AI usage | Governed: AI assists document extraction, user confirms before any forecast line is inserted. AI never writes directly to forecast_lines. | Non-negotiable §5 (00-context.md) |

---

## 4. Data Model

| Entity | Purpose | Source | Retention |
|---|---|---|---|
| `entity_groups` | Top-level group container (Augusto group) | Manual seed | Indefinite |
| `entities` | Operating entities (AUG, CNR, BAL, DD, WRS, AGC, ENT) | Manual seed; `is_pipeline_entity` toggle | Indefinite |
| `bank_accounts` | Per-entity bank accounts; opening balances | Manual entry | Indefinite |
| `categories` | The four-section taxonomy (Inflows / Outflows / Loans / Opening) | Hard-coded + seeded | Indefinite |
| `forecast_periods` | 52 weeks pre-generated, extended manually after a year | Seeded; HANDOFF.md says manual extension | Per business records — 7 years |
| `forecast_lines` | Atomic forecast entries (amount × week × category × entity × bank) | User-entered or pipeline-derived | Per business records — 7 years |
| `recurring_rules` | Auto-generators for payroll/rent/PAYE | User-configured in `/settings` | Indefinite while active |
| `scenarios` | Base/Best/Worst transforms applied over forecast_lines | Hard-coded |
| `documents` | Uploaded source docs + extraction state + confirmation log | User-uploaded | TBD — per `docs/SECURITY_BASELINE.md` "Audit log" |
| `intercompany` | Cross-entity transfers within the group | User-entered |
| `pipeline_*` (suite) | Project tracker driving Confirmed Revenue auto-derivation | User-entered |

### Referential Rules

- Every `forecast_line` references an `entity` (FK) and a `category` (FK) and a `forecast_period` (FK by week_index).
- `bank_account` is nullable on `forecast_line` (some categories don't carry a bank, e.g., Loans & Financing).
- `is_pipeline_entity = true` is required for an entity to appear in `/pipeline`.
- Every timestamp is stored UTC; rendered in `Pacific/Auckland`.

---

## 5. Workflows

| Workflow | Input | Decision logic | Output | Reviewer |
|---|---|---|---|---|
| Weekly forecast update (manual) | Operator types into detail grid | Cell save → Server Action → `forecast_lines` upsert | Updated row + subtotal recalculation | Operator (self) |
| Document-driven forecast update | Uploaded doc | OpenRouter extracts → user reviews → confirms → upsert | New `forecast_lines` rows | Operator (self) |
| Pipeline-driven forecast update | Operator marks project confirmed | `lib/forecast/engine.ts` derives Confirmed Revenue + Third Party Costs over the project's weeks | Auto-emitted forecast_lines | n/a (deterministic) |
| Recurring rule trigger | Time-based (52 weeks pre-emitted at seed) | Rule definition × week → forecast_line | Forecast lines for payroll/rent/PAYE | Operator audits via overrides |

Failure states + recovery: see `docs/RUNBOOKS.md`.

---

## 6. Evidence Ledger

| Claim | Evidence needed | Pass threshold | Failure meaning |
|---|---|---|---|
| "Doc extract works for typical Augusto inputs" | Run extraction against a folder of recent payroll PDFs + bank statement CSVs; compare extracted → expected | ≥ 95% line accuracy | Re-prompt or model swap before handoff |
| "Forecast math reconciles against Excel" | Operator runs one full weekly cycle; rolling 52-week Net Cashflow matches the prior Excel within $X tolerance | Operator sign-off | Block handoff; investigate engine.ts |
| "Performance is acceptable at production volume" | Seed 5 entities × 52 weeks × ~30 lines/week; measure first-paint + edit-commit | p95 first-paint ≤ 1.5s; p95 edit-commit ≤ 800ms | Trigger row windowing per REALITY-GAP row 5 |

---

## 7. Security, Privacy, and Access

- Data classes: business-financial (forecast amounts, bank balances), no PII beyond operator email
- Approved environments: Vercel production + Supabase production (both single-tenant)
- Authentication: Supabase Auth, email + password, no MFA enforced (recommended for owner accounts)
- Roles: none — single-operator
- Secret handling: Vercel env vars only (not Vault); rotation cadence quarterly per `docs/SECURITY_BASELINE.md`
- External services: OpenRouter (outbound), Supabase (full)
- Audit requirements: 7-year NZ business-records retention applies to forecast data; not yet wired (see `docs/SECURITY_BASELINE.md` audit-log row)

---

## 8. Acceptance Criteria

- [x] `npm run lint` clean
- [x] `npm run typecheck` clean
- [x] `npm run test:unit` green (19 specs covering forecast/pipeline/documents engines)
- [x] HANDOFF.md present and current
- [x] All 13 catalogue artefacts under `docs/` filled (no `TODO: fill before handoff` sentinels)
- [x] REALITY-GAP rows acknowledged with owner + target
- [ ] Operator runs one full weekly forecast cycle and reconciles against the prior Excel — **next acceptance gate**
- [ ] Logger + Sentry land before any third operator joins (REALITY-GAP row 3)

---

## 9. Known Limitations

| Limitation | Impact | Mitigation or next phase |
|---|---|---|
| No realtime collaboration | Two simultaneous editors lose edits to last-write-wins | Single-operator scope; revisit when needed |
| No centralized observability | Production failures may be invisible | REALITY-GAP row 3 |
| No integration tests | Server Action regressions caught only by unit tests on the engine layer | TEST_STRATEGY.md "Integration" gap |
| Doc extract has no rate limit | A leaked OPENROUTER_API_KEY could drive cost up | REALITY-GAP row 4 |
| Forecast detail render not measured at production volume | Possible jank with 5+ entities × 52 weeks | REALITY-GAP row 5 |

---

## 10. Known Unknowns

1. Per-month OpenRouter spend at production volume — Jack's estimate $50/mo is a placeholder; needs stakeholder confirmation
2. Whether Augusto wants a periodic Excel export (CSV download exists; full XLSX export does not)
3. Long-term retention policy for uploaded source documents (current behaviour: kept indefinitely in Supabase Storage)
4. Whether multi-entity rollup math handles intercompany flows correctly in all scenarios — pipeline projects spanning entities haven't been stress-tested

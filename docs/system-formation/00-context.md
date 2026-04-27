# 00 - Context: Augusto

Created: 2026-04-28
Project slug: `augusto-cashflow`
Starter pack: `none (pre-Phase-1 scaffold; backfilled retroactively)`
Enabled modules: auth, documents, forecast, pipeline

This document is the starting context for the system formation phase. It is factual, source-labelled, and current enough that a new builder can understand the client, users, constraints, and delivery posture without reopening every upstream note.

---

## 1. Target Users

| User group | Jobs to be done | Current workaround | Decision authority |
|---|---|---|---|
| Augusto group finance staff (1-2 operators) | Maintain a 52-week cash-flow forecast across multiple entities; reconcile against bank balances; run scenario analysis (Best/Worst/Base) | Excel workbook with cross-tab formulas; manually re-keyed each week from supplier invoices, payroll runs, and project pipeline | The single primary operator (Augusto's finance owner) makes day-to-day forecast decisions; group CFO approves quarterly framework changes |
| Augusto pipeline managers (read-only) | See which confirmed projects flow through to forecast revenue lines | None — pipeline projection sat in the same Excel | Read-only |

Verified via: HANDOFF.md (project's authoritative architecture context); Augusto stakeholder calls 2026-04-11 → 2026-04-14 (recorded in `docs/plans/2026-04-13-yasmine-feedback-round-2.md`).

---

## 2. Operating Context

| Context area | Notes | Source tier |
|---|---|---|
| Business model | Augusto is a NZ-based group with multiple operating entities (AUG, CNR, BAL, DD, WRS active in pipeline; AGC, ENT used elsewhere). Group cash flow is the primary financial concern of the finance function. | Confirmed fact (HANDOFF.md §Pipeline entity scope) |
| Customer journey | Primary user logs in weekly to: (1) review forecast detail grid, (2) confirm AI-extracted lines from uploaded documents (payroll PDFs, invoice CSVs, bank statements), (3) update pipeline confidence as projects progress | Confirmed fact (HANDOFF.md §Forecast Detail editing) |
| Compliance / policy | NZ business records — 7-year retention standard. PAYE + GST flows are part of the forecast categories (HANDOFF.md §Category structure). No external regulator audit dependency for the cashflow tool itself. | Confirmed fact |
| Current tooling | Pre-Augusto-app: Excel workbook. Augusto-app stack: Next.js 15 + React 19 + Supabase + OpenRouter (Claude) + Vercel | Confirmed fact (package.json) |
| Approval path | Single primary operator approves their own forecast updates; group CFO reviews quarterly | Confirmed fact (single-operator design) |

---

## 3. Prior Reviews and Decisions

| Review | Date | Decision or finding | Follow-up |
|---|---|---|---|
| Augusto stakeholder calls (Yasmine feedback rounds) | 2026-04-11 → 2026-04-14 | Excel-like grid behaviour required for adoption; AI doc extraction is the main time-saver | Implemented — see `docs/specs/2026-04-13-excel-like-grid-enhancements-design.md` |
| Mission Control PRB Phase 0 (ADR-001) | 2026-04-27 | Augusto's runtime = Mission Control fork (Next.js + Supabase). ERP rebuild specs at `client_pipeline/Augusto/Build_Plan/` are reference-only. | Phase 4.6 backfill (this session) is the current follow-up. |

---

## 4. Source Reliability Ladder

| Tier | Meaning | Examples for this project |
|---|---|---|
| Confirmed fact | Directly supported by client, system export, contract, or public source | HANDOFF.md sections; Augusto stakeholder Slack/email; supabase migration files; package.json |
| Strong hypothesis | Supported by multiple signals but still needs confirmation | Performance budgets in `docs/PERFORMANCE_BUDGET.md` (un-measured) |
| Benchmark | Category-level evidence, not client-specific proof | "Sub-1s grid render" — typical web-app target, not Augusto-measured |
| Internal inference | Reasoned from patterns or partial evidence | Cost ceiling of $50/mo OpenRouter — Jack's estimate, not stakeholder-confirmed |
| Deprecated assumption | Previously used but contradicted or superseded | Express/Fastify ERP rebuild (Build_Plan/) — superseded by ADR-001 |

---

## 5. Non-Negotiables

1. No production writes without `await requireAuth()` first.
2. No customer-facing automation without human review until acceptance criteria are met (the AI doc extractor confirms-with-user pattern is canonical).
3. Deterministic logic handles forecast math; AI assists extraction and explanation only.
4. All external services (OpenRouter, Supabase) are documented in `docs/SECURITY_BASELINE.md` before handoff.
5. Every handoff claim links to evidence — a file, a test, an ADR, or a runbook section.

Augusto-specific:
- Forecast lines are append-only conceptually; deletion is rare and requires auditable reason.
- Pipeline → Forecast auto-derivation must be transparent — operators see *why* a forecast line exists.

# Architecture - Augusto

> Module 1 deliverable. Single page; if it grows past two screens, split into ADRs.

**Project:** `augusto-cashflow` · **Starter pack:** `none (pre-Phase-1 scaffold; backfilled retroactively)`

---

## Enabled modules

auth, documents, forecast, pipeline

(Each enabled module is gated by `config/mission-control.config.json` and enforced via `lib/modules.ts`.)

## Key routes

| Route | Purpose | Auth | Module |
|---|---|---|---|
| `/login`, `/signup` | Supabase auth | public | auth |
| `/forecast` | Forecast overview (read-only summary) | required | forecast |
| `/forecast/detail` | Excel-like editable grid (52 weeks × all rows) | required | forecast |
| `/forecast/overrides` | Per-item scenario overrides | required | forecast |
| `/documents` | Document upload + AI extract review | required | documents |
| `/pipeline` | Project tracker (confidence-based forecast lines) | required | pipeline |
| `/settings` | Recurring rules, entities, OD limits | required | settings |
| `/guide` | Operator help docs | required | guide |
| `/api/process-document` | Server-side AI extract (calls OpenRouter) | required | documents |

## Supabase surfaces

| Surface | Detail |
|---|---|
| Tables | 25 migrations under `supabase/migrations/`. Key user-data tables: `entity_groups`, `entities`, `bank_accounts`, `categories`, `forecast_periods`, `forecast_lines`, `recurring_rules`, `scenarios`, `documents`, `intercompany`, `pipeline_*`. RLS enabled in `010_rls_policies.sql`. |
| Edge functions | `supabase/functions/process-document/` — wraps the OpenRouter call so the service role key stays server-side and the response can be streamed/typed before reaching the client |
| Realtime channels | None — Augusto is single-user, last-write-wins (per HANDOFF.md). |
| Storage buckets | One bucket for uploaded source documents (xlsx, csv, pdf, docx). Configured in Supabase project settings; not in migrations. |

## Agents

Augusto cashflow has no first-class "agent" abstraction (no MC-style agent registry). The closest equivalent is the document extractor:

| Agent | Trigger | LLM | Owner |
|---|---|---|---|
| document-extractor (informal) | User uploads a document via `/documents` | OpenRouter → Claude (model from app config) | Jack |

## Integrations

| Integration | Connector | Direction | Auth |
|---|---|---|---|
| OpenRouter (Claude) | `supabase/functions/process-document/` (Deno edge function) | Outbound only | Bearer token (`OPENROUTER_API_KEY` in Vercel env) |
| Supabase | First-party SDK (`@supabase/ssr`, `@supabase/supabase-js`) | Both | Anon key (browser) + service-role (server only) |

## Boundaries

| Boundary | Owner | Contract |
|---|---|---|
| Server Actions | `lib/auth.ts:requireAuth()` | `await requireAuth()` first line of every state-mutating action |
| External API calls | `lib/documents/` extraction-schema.ts | Zod-parse OpenRouter responses against `extraction-schema.ts` shapes before user-confirm |
| Webhook receivers | n/a | No webhooks in Augusto |
| LLM calls | `supabase/functions/process-document/` | Single provider (OpenRouter); no fallback chain; cost ceiling deferred (REALITY-GAP row 5) |
| Forecast write path | `lib/forecast/engine.ts` (pure) → Server Action → Supabase | Engine is pure; Server Action commits in a single transaction |

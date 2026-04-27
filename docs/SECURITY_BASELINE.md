# Security Baseline - Augusto

> Module 4. Every row is a hardening commitment. Handoff gate enforced.

**Project:** `augusto-cashflow`

---

## Authentication

| Concern | Detail |
|---|---|
| Provider | Supabase Auth |
| Server-side auth helper | `lib/auth.ts:requireAuth()` — redirects to `/login` on missing session |
| Server Action gate | `await requireAuth()` MUST be the first line of every Server Action that mutates state |
| MFA policy | Not enforced. Augusto is single-operator; MFA can be turned on per-user in Supabase Auth dashboard. Recommended for production owner accounts. |
| Session lifetime | Supabase default (1 hour access token + 7-day refresh token rotation). |
| Password / SSO requirements | Email + password via Supabase. No SSO. Password complexity = Supabase default (≥6 chars). Recommend ≥12 chars + breach-list check post-handoff. |

## Authorization (RBAC + RLS)

| Concern | Detail |
|---|---|
| Role model | None — single-operator build. All authenticated users have full read/write to their own org's data; no admin/member/viewer split. |
| RLS policy coverage | `supabase/migrations/010_rls_policies.sql` is the canonical RLS migration. Every user-data table has a policy gating on `auth.uid()` ↔ `entity.org_id`. **Verification: post-handoff, run a probe SELECT as an unauthenticated user against each table and confirm 0 rows returned.** |
| RLS bypass | Server-side mutation actions in `app/(app)/forecast/actions.ts` and similar use the server-component Supabase client which respects RLS. There is no `supabase-admin` bypass client wired in this build (gap vs MC's three-client pattern; not necessary for single-operator scope but document if a future migration introduces admin-only operations). |

## Secrets

| Concern | Detail |
|---|---|
| Storage | Vercel project env vars. Supabase Vault is NOT wired (gap vs MC pattern). |
| Per-secret list (Vercel env) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_APP_URL` |
| BYOK resolution | None — single-tenant key. No `lib/resolve-api-key.ts` (gap vs MC pattern; not necessary for single-tenant scope). |
| Rotation policy | **Documented quarterly cadence:** rotate `OPENROUTER_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` every 90 days. Track each rotation in the table below. |
| Rotation log | (empty — first rotation due 2026-07-28) |
| Repo secret-scan | Manual `git secrets --scan` before push. No CI scanner wired. **TODO: add `gitleaks` to `.github/workflows/ci.yml` in a follow-up sprint.** |

## Webhooks

Not applicable — Augusto cashflow has no webhook receivers. The OpenRouter integration is outbound-only (Augusto → OpenRouter, never the reverse).

If a future feature requires webhooks, add a verification helper at `lib/webhook.ts` mirroring MC's HMAC-SHA256 pattern and add per-source rate limiting before the handler.

## Rate limits

| Surface | Limit | Window | Source |
|---|---|---|---|
| `app/api/documents/extract` (OpenRouter call) | **Currently none.** Recommended: 10/min/user | per-minute | To add — see REALITY-GAP row 4 |
| Server Actions (forecast save, document confirm) | None — protected by Supabase Auth session and RLS row gating | n/a | n/a |
| Public Supabase Auth (`/login`, `/signup`) | Supabase default (DDoS protection at Cloudflare layer in front of Supabase) | n/a | Supabase |

**Status of doc-extract rate limit: Deferred to post-handoff (REALITY-GAP row 4).** Owner: Jack. Target: 2026-05-15.

## Audit log

| Concern | Detail |
|---|---|
| Table | None today. Forecast line edits are not audited; document confirmation is not audited. |
| Recommended coverage | At minimum: forecast_line edits (who, when, before/after value), document confirmation (who, document_id, line_count_imported), settings changes (who, key, before/after) |
| Retention | When implemented, target 7 years (NZ business records standard). |
| Status | **Deferred — not blocking single-operator handoff but blocking any future multi-operator deployment.** |

---

## Cross-references

- Observability: `docs/OBSERVABILITY.md`
- Production-readiness gate: `docs/PRODUCTION_READINESS.md` Module 4
- Reality Gap: `REALITY-GAP.md` Security row
- Rotation cadence: `docs/RUNBOOKS.md` "OPENROUTER_API_KEY rotation" runbook

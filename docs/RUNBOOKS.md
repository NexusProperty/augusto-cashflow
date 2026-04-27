# Runbooks - Augusto

> Per-failure-mode triage. Every runbook has detection, triage, mitigation, and a postmortem trigger.

**Project:** `augusto-cashflow`

---

## Failure mode: OpenRouter (Claude) outage

### Detection
- User reports: "Document upload finished but extracted lines never appeared"
- Vercel function logs show `documents_extract` returning 5xx or timing out
- (Post REALITY-GAP row 3) Sentry `documents_extract_failed` alert fires

### Triage
1. Open https://status.openrouter.ai — is OpenRouter up?
2. If OpenRouter is up, test with a known-good document outside the app: `curl -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/models | head -20`
3. If 401 from OpenRouter: the key is invalidated — go to "OPENROUTER_API_KEY rotation" below
4. If 429 from OpenRouter: rate-limited at the provider — check OpenRouter usage dashboard; the per-IP rate limit on `app/api/documents/extract` (REALITY-GAP row 4) would have prevented this
5. If OpenRouter is down: confirm with their X/Twitter; no fallback provider is wired in this build

### Mitigation
- **Short-term (provider down):** Tell users to retry uploads in 30 min. There is no auto-queue today; failed extractions must be manually re-uploaded once OpenRouter recovers.
- **Long-term:** Add a queue (Supabase row in `documents` table with `status='extract_failed'`) and a cron that retries every 30 min for up to 24h.

### Postmortem trigger
Outage > 60 min OR > 5 affected document uploads.

---

## Failure mode: OPENROUTER_API_KEY rotation (planned or emergency)

### Detection
- Quarterly cadence (per `docs/SECURITY_BASELINE.md`)
- Emergency: any 401 from OpenRouter; any suspected leak (key in a screenshot, a public repo, an outbound email)

### Triage
1. Confirm scope: is this a planned rotation or an emergency?
2. For emergency: check OpenRouter usage dashboard for unexpected spend in the last 7 days

### Mitigation
1. Mint NEW key in OpenRouter dashboard (https://openrouter.ai/keys) FIRST — before deleting the old one. Per memory `feedback_token_rotate_sequencing`, mint-then-delete prevents the "production briefly on invalidated token" window.
2. Update `OPENROUTER_API_KEY` in Vercel env (Production AND Preview — per memory `feedback_vercel_preview_env_drift`, missing the Preview env causes preview deploys to 401).
3. Trigger a redeploy: `vercel deploy --prod` (or push an empty commit).
4. Verify a doc-extract succeeds in production using a known-good test document.
5. Delete the OLD key in OpenRouter dashboard.
6. Append a row to `docs/SECURITY_BASELINE.md` rotation log: date, person, reason.

### Postmortem trigger
Emergency rotation always triggers a 1-page postmortem documenting how the leak happened.

---

## Failure mode: Supabase migration failure during deploy

### Detection
- `npm run db:push` exits non-zero
- Vercel build fails with `migration ... failed to apply`

### Triage
1. Read the pg error from the migration step. Common causes for Augusto:
   - Renaming a column in `forecast_lines` while the app's schema cache still references the old column
   - Dropping an index while another in-flight query holds a lock
   - A check constraint that fails because existing rows violate it (typical in NZ data: NULL `gst_rate` rows pre-dating GST refactor)
2. Check whether the migration is idempotent (some early Augusto migrations were not). If not, the failure may have left the schema in a half-applied state.

### Mitigation
- **If the migration is mid-apply and reversible:** roll back via `supabase db push --include-roles=false --reset-target=HEAD~1` (drops to previous migration). Then fix the migration locally, retest, redeploy.
- **If the migration applied partially (some statements ran, others did not):** manually clean up via `psql` against the production DB — the migration file's intended end state is the canonical truth.
- **NEVER edit a migration file in-place after it has been applied to any environment.** Append a new migration that fixes-forward.

### Postmortem trigger
Any production data loss OR > 30 min of forecast-save downtime.

---

## Failure mode: Forecast detail grid stuck on "Save failed"

### Detection
- User reports the chip in the forecast detail toolbar shows "Save failed (4s)" on every cell edit
- Browser console shows 401 / 403 / 5xx from the save endpoint

### Triage
1. Ask the user to refresh the page. If "Save failed" persists, the session likely expired (Supabase access token TTL is 1 hour).
2. If refresh did not fix it, ask the user to log out and back in. This rotates the refresh token.
3. If still failing, check Vercel function logs for `forecast.save` errors. Common causes:
   - A migration drifted the `forecast_lines` schema vs the TypeScript types in `lib/database.types.ts` — run `npm run gen:types:remote` and rebuild
   - RLS denying the update because `org_id` on the row no longer matches the user's session

### Mitigation
- Most cases: user re-login fixes it
- Schema drift: regenerate types, redeploy
- RLS misconfig: file an emergency security review — log out the affected user, audit the RLS policy in `010_rls_policies.sql`

### Postmortem trigger
Any case where the user's edits did not persist AND were not recoverable from any other surface (no toast, no logs, no DB row).

---

## Failure mode: New incident type encountered

When a new failure mode shows up that isn't in this document:

1. Triage live first (don't stop to write docs while bleeding).
2. Once stable, write a runbook entry here matching the four-section pattern (Detection / Triage / Mitigation / Postmortem trigger).
3. Cross-link from `REALITY-GAP.md` if the failure mode reveals a category-level gap (then the gap is the row, this runbook is the immediate-response).

---

## Cross-references

- Observability: `docs/OBSERVABILITY.md`
- Security baseline: `docs/SECURITY_BASELINE.md`
- Reality Gap: `REALITY-GAP.md`
- Mission Control memory entries that informed these runbooks:
  - `feedback_token_rotate_sequencing` (mint-then-delete OPENROUTER_API_KEY)
  - `feedback_vercel_preview_env_drift` (rotate Preview env too)

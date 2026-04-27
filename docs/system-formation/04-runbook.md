# 04 - Runbook: Augusto

**Project slug:** `augusto-cashflow`
**Created:** 2026-04-28

This runbook is the operator's daily-ops reference. Live-incident triage runbooks live in `docs/RUNBOOKS.md` (separate doc; cross-linked).

---

## 1. Daily ops

### Add a new forecast week

The schema pre-generates 52 weeks. After about a year, the operator extends:

1. Insert new rows into `forecast_periods` covering the next 52 weeks.
2. Verify recurring rules emit for the new weeks (settle by checking one or two payroll lines in the new weeks).
3. No deploy required — this is a data operation.

### Add a new entity

1. Insert into `entities` with `entity_group_id` matching the parent group.
2. If the entity should appear in the pipeline tracker, set `is_pipeline_entity = true`.
3. Add bank account(s) for the entity in `bank_accounts`.
4. Set opening balance(s) on the bank account.
5. The forecast detail grid + pipeline page pick up the new entity automatically on next page load.

### Adjust an entity's overdraft (OD) limit

```sql
update entity_groups set od_facility_limit = <new_limit> where id = <group_id>;
```

The forecast overview re-renders the OD chip immediately (no app deploy).

### Toggle pipeline visibility for an entity

```sql
update entities set is_pipeline_entity = true|false where code = '<CODE>';
```

Disabled entities still hold forecast lines but won't appear in `/pipeline`.

### Doc upload + AI confirm flow (operator's view)

1. Drag-drop a doc onto `/documents`. Supported: xlsx, csv, pdf, docx.
2. Wait for the "Extracted" status (typically 5-10s for a 1-3 page doc).
3. Click into the doc; review the extracted lines side-by-side with the source.
4. Edit any extracted amount or category that's wrong.
5. Click "Confirm" — the lines insert into the forecast. (Per REALITY-GAP row 2, double-click is currently NOT idempotent — wait for the toast before clicking again.)
6. The confirmed lines appear in `/forecast/detail` immediately.

---

## 2. Periodic maintenance

| Cadence | Action |
|---|---|
| Weekly | Run a full forecast review — paste any outstanding bank statements; confirm pipeline confidence updates |
| Monthly | Review OpenRouter spend in the OpenRouter dashboard; compare to `docs/PERFORMANCE_BUDGET.md` $50/mo target |
| Quarterly | Rotate `OPENROUTER_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (per `docs/SECURITY_BASELINE.md` rotation log; per `docs/RUNBOOKS.md` "OPENROUTER_API_KEY rotation" runbook) |
| Quarterly | Re-run RLS probe: as an unauthenticated user, attempt SELECT against `forecast_lines`, `documents`, `pipeline_*` — expect 0 rows |
| Annually | Extend `forecast_periods` with another 52 weeks |

---

## 3. Common quick-fixes

### Operator says "Save failed" appears on every cell edit

Most likely Supabase session expired. Fix: log out + log in.

If still failing after re-login, see `docs/RUNBOOKS.md` "Forecast detail grid stuck on 'Save failed'".

### Operator says "Extracted lines never appeared after upload"

OpenRouter outage or 401. See `docs/RUNBOOKS.md` "OpenRouter (Claude) outage".

### Operator says "Confirmed Revenue line is wrong"

Confirmed Revenue is auto-derived from confirmed pipeline projects. Don't edit it directly in the forecast — fix the pipeline project (entity, amount, weeks) and the derivation will update.

---

## 4. Where things live

| Concern | File / route |
|---|---|
| Forecast engine (pure math) | `lib/forecast/engine.ts` (and aggregates, dep-graph, per-bank-engine) |
| Pipeline → Forecast derivation | `lib/forecast/engine.ts` (called from forecast Server Actions) |
| AI doc extractor | `supabase/functions/process-document/` |
| Recurring-rule expansion | `lib/forecast/` (search for `recurring`) |
| Auth | `lib/auth.ts:requireAuth()` |
| Supabase client (server) | `lib/supabase/server.ts` |
| Excel-like grid | `app/(app)/forecast/detail/page.tsx` |

---

## 5. When to escalate

- Any incident lasting > 30 min where the operator cannot save edits → page Jack
- Any case where forecast numbers do not reconcile against the prior Excel → page Jack
- Any 401 from OpenRouter → start `OPENROUTER_API_KEY rotation` runbook
- Any unauthorized read confirmed in logs → security review (see `docs/SECURITY_BASELINE.md`)

---

## Cross-references

- Live-incident triage: `docs/RUNBOOKS.md`
- Architecture: `docs/ARCHITECTURE.md`
- Security baseline: `docs/SECURITY_BASELINE.md`

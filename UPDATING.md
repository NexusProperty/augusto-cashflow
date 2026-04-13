# Updating Augusto Cash Flow

You've just pulled new code. This document covers what to do next. For first-time setup see [HANDOFF.md](./HANDOFF.md).

## TL;DR

```bash
git pull
npm run update
```

That's it. The `update` script chains four steps:

1. `npm install` — picks up any dependency changes.
2. `npm run db:push` — applies any new Supabase migrations to your remote DB.
3. `npm run gen:types:remote` — regenerates `lib/database.types.ts` from the now-migrated schema.
4. `npm run typecheck` — verifies the codebase still compiles cleanly against the new types.

If any step fails, stop and fix it before moving on. Never skip past a failing migration or type regeneration — the app will misbehave silently.

## Prerequisites (one-time)

The `update` script only works if the Supabase CLI is set up on your machine:

```bash
# Install the CLI (Windows)
scoop install supabase
# or macOS / Linux
brew install supabase/tap/supabase

# Log in
supabase login

# Link to the project (only once — saves config in supabase/.temp/)
supabase link --project-ref loyvvqbybubuoxpuawew
```

After linking, `db:push` and `gen:types:remote` talk to the correct Supabase project automatically.

## Deployment (Vercel)

Vercel auto-deploys on push to `main`. You don't need to do anything extra — the build on Vercel runs `npm install && npm run build` for you.

**However**, Vercel does **not** run database migrations. After pushing code that includes a new migration, either run `npm run db:push` locally (which applies to the shared remote DB), or let whoever owns the Supabase project push it — not Vercel.

## Individual steps

If you'd rather run steps one at a time (e.g. because you're debugging a migration):

```bash
# 1. Pull and install deps
git pull
npm install

# 2. Apply migrations
npm run db:push

# 3. Refresh types to match new schema
npm run gen:types:remote

# 4. Verify
npm run typecheck
npm run test:unit
```

## Common issues

### "supabase: command not found"
Install the Supabase CLI (see prerequisites above).

### "Project not linked"
Run `supabase link --project-ref loyvvqbybubuoxpuawew`.

### Migration fails on `db:push`
Most likely cause: a local migration diverges from what's already on the remote. Run `supabase migration repair --status applied <migration_name>` for each migration the error mentions, then retry. If you're stuck, roll back locally (`git checkout -- supabase/migrations`) and re-pull.

### TypeScript errors after update
Usually the gen:types step didn't run or ran against a stale schema. Retry:
```bash
npm run db:push
npm run gen:types:remote
npm run typecheck
```

### "TypeError: fetch failed" on `db:push`
You may not be logged in. Run `supabase login` and retry.

## What just shipped (2026-04-14)

Pulling up through commit `386bd66` brings in the Phase 1–3 Excel-like grid enhancements:

- Full undo/redo across edits, status changes, shifts, creates
- Cell-reference formulas (`=SUM(W1:W4)`, `=@Payroll:W1`, `=IF(...)`)
- Smart fill handle + series detection
- Shift / duplicate / copy-forward / split-cell
- `Ctrl+F` find, `Ctrl+Home/End`, `Ctrl+Arrow` navigation
- Row grouping, freeze columns, CSV export
- Process / Delete buttons on the Documents page
- Refreshed in-app Guide at `/guide`

Migration **023_forecast_line_formula.sql** adds a nullable `formula` column to `forecast_lines`. Safe metadata-only alter; no data loss, no downtime.

See the in-app Guide after `npm run dev` for the full feature list and keyboard shortcuts.

# Plan — Per-Bank Opening Balances

**Date:** 2026-04-14
**Target:** `/forecast/detail` Section 1 ("OPENING BANK BALANCE")
**Status:** Approved.

---

## Goals

Replace the single GROUP-level opening/closing balance with per-bank rolling balances for the 4 main operating banks. User enters week-1 opening per bank; subsequent weeks cascade automatically (closing of week N = opening of week N+1).

**Banks in scope** (4): Augusto Current, Cornerstore, Augusto Commercial, Dark Doris (Nets). **Coachmate explicitly excluded** — it has its own `/forecast/coachmate` view.

**Decisions confirmed:**
1. Untagged forecast lines default to Augusto Current.
2. Coachmate excluded from this view.
3. Week-1 opening editable inline; persists to `bank_accounts.opening_balance`.
4. OD Status stays aggregate.
5. Existing balance-direction `forecast_lines` are wiped (section is empty already).
6. Backfill the 3 untagged lines to Augusto Current up front.

---

## Ground rules

- **Engine remains side-effect-free.** Per-bank state is added; group totals stay numerically identical (same sum, different decomposition).
- **Augusto Current is the canonical default.** A constant `DEFAULT_BANK_NAME = 'Augusto Current'` in `lib/forecast/constants.ts` (or similar) — used by the engine fallback AND by the migration backfill.
- **Coachmate exclusion is a render-time concern.** The DB still holds Coachmate as `is_active`; the new "main forecast banks" set is computed by `is_active = true AND name <> 'Coachmate'` (or similar — confirm exact name during impl).
- **Optimistic UX.** Week-1 cell edits use the same optimistic + revert pattern as the rest of the grid.
- **No regressions to existing aggregated rows.** Closing Balance / Available Cash / OD Status keep their current numbers.
- **Commit boundaries:** 2 commits — backend (migration + engine + action + tests) and frontend (Section 1 render).

---

## Task 1 — Migration + engine + server action + tests

**Files**

- `supabase/migrations/024_per_bank_opening_balances.sql` (new):
  ```sql
  ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance numeric DEFAULT 0 NOT NULL;

  -- Backfill: tag untagged forecast_lines to Augusto Current
  UPDATE forecast_lines
  SET bank_account_id = (SELECT id FROM bank_accounts WHERE name = 'Augusto Current' LIMIT 1)
  WHERE bank_account_id IS NULL;

  -- Wipe existing balance-direction forecast_lines (empty in prod, defensive)
  DELETE FROM forecast_lines
  WHERE category_id IN (
    SELECT id FROM categories WHERE direction = 'balance'
  );
  ```
- `lib/database.types.ts` — regenerate via `npm run gen:types:remote` after migration push.
- `lib/forecast/constants.ts` (new or extend existing): export `DEFAULT_BANK_NAME = 'Augusto Current'` and `MAIN_FORECAST_BANK_NAMES = ['Augusto Current', 'Cornerstore', 'Augusto Commercial', 'Dark Doris (Nets)']`.
- `lib/forecast/engine.ts`:
  - Extend `WeekSummary` (in `lib/types.ts`) with `byBank: Record<string, BankBalance>` where `BankBalance = { openingBalance: number; netCashFlow: number; closingBalance: number }`.
  - In the engine, accept `bankAccounts: BankAccount[]` (with `opening_balance`). For each period:
    - For each main bank, compute `openingBalance` = (week 1: bank.opening_balance; else: prior week's `closing` for that bank).
    - Sum the period's forecast_lines per bank (using `bank_account_id`, falling back to default bank when null — defensive even though backfill ran).
    - Skip lines whose category direction is `'balance'` (legacy, should be empty).
    - `closingBalance[bank] = openingBalance[bank] + netCashFlow[bank]`.
  - Group totals (`openingBalance`, `closingBalance`) become `sum(byBank.*.openingBalance)` and `sum(byBank.*.closingBalance)`. Net inflows/outflows / loans stay as-is — they're direction-driven not bank-driven.
- `app/(app)/forecast/actions.ts`:
  - `updateBankOpeningBalance(bankAccountId: string, openingBalance: number)` — Zod-validates input, `requireAuth()`, `supabase.from('bank_accounts').update({ opening_balance }).eq('id', bankAccountId).eq('is_active', true)`. Revalidates `/forecast/detail`.
- `tests/unit/per-bank-engine.test.ts` (new):
  - 1 bank, 3 weeks, week-1 opening 1000, no flows → opening = 1000, 1000, 1000; closing = 1000 across all weeks.
  - 2 banks, week-1 inflow on bank A only → bank A closes higher, bank B unchanged.
  - Default-bank fallback: forecast_line with `bank_account_id = null` flows into Augusto Current.
  - Group total = sum(byBank.closing) for every week.
  - Coachmate is excluded from `byBank` keys.
- `tests/unit/forecast-actions.test.ts` (extend if exists, else new): `updateBankOpeningBalance` calls supabase update with the right args; rejects negative balances? — leave permissive; banks can be in OD.

**Push migration after typecheck + tests pass:** `npm run db:push` then `npm run gen:types:remote`.

**Verification gate before continuing to Task 2:**
- `npm run typecheck` clean.
- `npm run test:unit` green (504 prior + new tests).
- Migration applied to remote (`supabase migration list`).

---

## Task 2 — Section 1 rendering + UI wiring

**Files**

- `lib/forecast/flat-rows.ts`:
  - New row kind: `'bank-opening'` with `{ kind: 'bank-opening'; bankAccountId: string; bankName: string }`.
  - Inside the section-building loop, when the section is the OPENING BANK BALANCE category, replace the regular item-row emission with one `'bank-opening'` row per bank in `MAIN_FORECAST_BANK_NAMES` (in display order).
- `components/forecast/forecast-row.tsx` (or wherever rows are rendered):
  - Handle `'bank-opening'` kind. Render label cell = bank name. Render 18 cells:
    - Week 1: editable `<InlineCell>` showing `bank.opening_balance`. On commit, calls `updateBankOpeningBalance(bankId, newValue)` via the existing pattern; optimistic update of `localBankBalances` state, revert on error.
    - Weeks 2-18: read-only computed cell showing `summaries[w-1].byBank[bankId].closingBalance` (= the opening for week w). Visually distinguishable as derived (e.g., subtle gray bg + cursor: not-allowed).
- `components/forecast/forecast-grid.tsx`:
  - Pass `bankAccounts` + `localBankBalances` (new useState seeded from server) into the row builder.
  - Add `handleBankOpeningCommit(bankId, value)` that updates local state then `startTransition(() => updateBankOpeningBalance(...))` with revert on error.
  - The bottom Closing Balance row reads `summary.closingBalance` exactly as today — no change.
- Keep selection / undo / find / export interactions working on bank-opening cells where they make sense:
  - **Selection stats:** include the editable week-1 cell values; computed cells contribute their displayed value too.
  - **Undo/redo:** include `BankOpeningUpdate` in the undo entry union; revert restores prior balance with `updateBankOpeningBalance`.
  - **Find:** searches bank names + amounts.
  - **Export:** appears in CSV under Section 1.
  - **Fill handle / shift / split / formulas / Ctrl+D / paste:** disabled on bank-opening rows for week 1 (single-cell concept), entirely disabled on weeks 2-18 (computed). Treat the row much like a pipeline row: read-only except week 1.

**Manual QA**

- Edit Augusto Current week-1 = $200,000 → cascades right: every subsequent week's opening for Augusto Current = $200,000 + cumulative net through that week.
- Add a $50,000 inflow on Augusto Commercial week 3 → Augusto Commercial closing rises from week 3 onward; Augusto Current unchanged.
- Aggregated bottom Closing Balance row = sum of the 4 bank closings.
- Coachmate not visible in Section 1; Coachmate forecast_lines (if any) skipped from per-bank attribution.
- Refresh page → values persist.

---

## Risk & rollback

- **Migration is additive** (new column, default 0; backfill of UNTAGGED lines only). Reversible: drop column + revert backfill via prior bank_account_id (lost — accept).
- **Engine change is decomposition, not arithmetic.** Group totals remain identical for any input where every line is tagged. The default-bank fallback is the only source of a difference, and it only affects how the previously-untagged 3 lines distribute (which today they didn't distribute at all — they hit the group sum directly).
- **Rollback:** revert the two commits + run `ALTER TABLE bank_accounts DROP COLUMN opening_balance`.

## Out of scope (explicit)

- Per-bank OD Status (still aggregate).
- Per-bank Available Cash row.
- Inter-bank transfers UI (would need a `transfers` table).
- Multi-currency.
- Editable opening for weeks 2-18 (cascade is implicit; if user wants to override mid-stream they can post a balance-direction forecast line — but we're wiping that path; defer until requested).

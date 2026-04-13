# Plan — Yasmine Feedback Round 2 (Category restructure + Excel-like editing)

**Date:** 2026-04-13
**Source:** `client_pipeline/Augusto/Mail - Jack Chen - Outlook.pdf` (thread 11–13 Apr 2026)
**Status:** Awaiting user approval before execution

---

## Goals

Land the 4 independent change groups from Yasmine's thread plus the verbal spreadsheet-UX ask.

1. **Category restructure** to match Yasmine's 3:05pm outline
2. **AP third-party supplier costs** driven by pipeline `third_party_costs`
3. **Exclude AGC & ENT from pipeline** only (not globally)
4. **Excel-like cell editing** — cascading recompute, keyboard nav, subtotal-edit proration

---

## Decisions (from user, 2026-04-13)

| # | Question | Answer |
|---|---|---|
| 1 | AR vs Revenue Tracker split | **AR = manually entered billed invoices only.** **Revenue Tracker = pipeline-sourced confirmed-only revenue.** Pipeline sync re-targets from `inflows_ar` to new `inflows_revenue_tracker` and filters to `stage='confirmed'`. |
| 2 | Fixed Overheads rename | Display name only; keep DB `code = outflows_dd` |
| 3 | GST split | Two new categories (`inflows_gst_refund`, `outflows_gst_payment`); drop old `inflows_gst`; fresh start (no line migration) |
| 4 | Credit Cards | Plain outflow — no bank link |
| 5 | Loan OD & Interest Fees | Fees + interest on the BNZ $900k OD trade facility — its own sub-category under Loans & Financing |
| 6 | Excel scope | Cascading recompute + keyboard nav + **subtotal editing that prorates to lines below** |

---

## Group 1 — Migration `020_category_restructure.sql`

### Schema changes
- Drop category `c0000000-0000-0000-0000-000000000012` (`inflows_gst`, "GST (Net)") via FK cascade — delete dependent `forecast_lines` where `category_id` points there
- Rename category name of `outflows_dd` from "Direct Debits & Fixed Overheads" → "Fixed Overheads" (code unchanged)

### New categories
| Code | Name | Parent | Section # | Flow |
|---|---|---|---|---|
| `inflows_gst_refund` | GST Refund | `inflows` | 2c | inflow |
| `inflows_revenue_tracker` | Confirmed Revenue (Revenue Tracker) | `inflows` | 2d | inflow |
| `outflows_contractors` | Contractors | `outflows` | 3b | outflow |
| `outflows_paye` (exists) | (bump section# to 3c) | — | — | — |
| `outflows_rent` (exists) | (bump to 3d) | — | — | — |
| `outflows_insurance` (exists) | (assign 3e) | — | — | — |
| `outflows_gst_payment` | GST Payment | `outflows` | 3f | outflow |
| `outflows_dd` (rename name) | Fixed Overheads (was "Direct Debits & Fixed Overheads"), code unchanged, section# 3g | — | — | — |
| `outflows_credit_cards` | Credit Cards | `outflows` | 3h | outflow |
| `outflows_ap` (exists) | Supplier Batch Payments (AP) — bump to 3i | — | — | — |
| `outflows_ap_third_party` | Third Party Supplier Costs | `outflows_ap` (nested) | 3i.1 | outflow |
| `loans_bnz` | BNZ Loan | `loans` | 4c | outflow |
| `loans_od_interest` | Loan OD & Interest Fees | `loans` | 4d | outflow |

### Data changes
- Delete `forecast_lines` where `source='pipeline' AND category_id = inflows_ar` (will be re-emitted under `inflows_revenue_tracker` by the updated sync engine on next run)
- Delete `forecast_lines` where `category_id = inflows_gst` (replaced)

### Entity flag for pipeline exclusion
- Add column `entities.is_pipeline_entity boolean not null default true`
- `update entities set is_pipeline_entity = false where code in ('AGC','ENT');`

---

## Group 2 — Pipeline sync engine changes

**File:** `lib/pipeline/sync-engine.ts`

- Filter input to **`stage='confirmed'` only** (currently syncs all stages)
- Emit two line sets per confirmed project:
  1. **Revenue line** → category `inflows_revenue_tracker` (was `inflows_ar`), `billing_amount * weekly_weight`, positive amount
  2. **Third-party cost line** → category `outflows_ap_third_party`, `third_party_costs * weekly_weight`, **negative** amount, same weekly distribution as revenue
- Both lines tagged `source='pipeline'`, `sourcePipelineProjectId = project.id`, counterparty = client name
- Confidence = 100 (only confirmed syncs)
- Deletion: on re-sync, delete all lines where `source_pipeline_project_id = project.id` then re-insert
- Remove the legacy AR target fallback

**File:** `lib/pipeline/queries.ts` (new helper)
- `loadPipelineEntities(supabase, groupId)` — identical to `loadEntities` but adds `eq('is_pipeline_entity', true)`
- Update pipeline pages (`/pipeline`, `/pipeline/summary`, `/pipeline/targets`) + import parser to use the new helper

### Tests
- `tests/unit/pipeline-sync-engine.test.ts` — add cases: non-confirmed stage skipped; third-party cost line emitted with negative amount and same period distribution; re-sync replaces prior lines

---

## Group 3 — Excel-like editing

### 3a. Optimistic client-side state + cascading recompute

**File:** `components/forecast/forecast-grid.tsx`

- Move `lines` and `summaries` into `useState` (initial from props)
- Add a `lineVersion` counter that bumps on every edit → re-runs `computeWeekSummaries` in a `useMemo`
- `handleCellSave(lineId, amount)` now:
  1. Updates local `lines` state → triggers recompute → UI cascades (subtotals, section totals, Net Operating, Closing, Available Cash, OD Status)
  2. Fires `updateLineAmount` in `startTransition`
  3. On server error → revert by reverting the local line and showing a toast
- Section totals, sub-section subtotals, and `WeekSummary` fields recompute purely from `lines` — no extra plumbing needed because they're already derived

### 3b. Keyboard navigation — `InlineCell`

**File:** `components/forecast/inline-cell.tsx`

- Hold a `cellCoord` (row index, period index) via `data-*` attributes on each cell
- On edit:
  - `Enter` → save + move focus **down** one row
  - `Shift+Enter` → save + move **up**
  - `Tab` → save + move **right** (or next row start at end of row)
  - `Shift+Tab` → save + move **left**
  - `Esc` → cancel (revert draft, exit edit mode)
- When not editing: arrow keys move focus; any digit/`-`/`.` keypress enters edit mode pre-filled with that character (Excel behavior)
- Add `role="gridcell"` + keyboard handlers at grid level for arrow nav

### 3c. Subtotal editing with proration

**Concept:** When user edits a sub-section subtotal cell (e.g., "Payroll" total for week N), distribute the new target across the underlying lines.

**Current behavior:** subtotal cells are read-only (`isComputed=true`).

**New behavior:** subtotal cells become editable when there is ≥1 non-zero underlying line.

**New module:** `lib/forecast/proration.ts`

```ts
export function prorateSubtotal(
  lines: ForecastLine[],
  subCategoryIds: string[],
  periodId: string,
  newTotal: number,
): { updated: ForecastLine[]; changed: Array<{ id: string; amount: number }> }
```

- Proportional scaling: if `currentTotal !== 0`, each affected line becomes `line.amount * (newTotal / currentTotal)`. Preserves sign and relative weight.
- Edge: `currentTotal === 0` AND lines exist → distribute **evenly**
- Edge: no underlying lines in period → no-op, return unchanged (surface a toast: "Add at least one line first")
- Pipeline-sourced lines are **skipped** (can't edit pipeline-synced values — they'd get overwritten on next sync). If ALL lines are pipeline-sourced, show toast: "Use the Pipeline page to edit these amounts."

**Grid wiring:** `SectionBlock` passes a `onSubtotalSave(subCategoryIds, periodId, newTotal)` into the sub-section total row. `ForecastGrid` runs `prorateSubtotal`, updates local state, and fires a batched server action.

### 3d. Batched line update action

**File:** `app/(app)/forecast/actions.ts`

```ts
export async function updateLineAmounts(payload: { id: string; amount: number }[])
```

- Zod array schema, `requireAuth()`, single `upsert` or per-row `update` inside a transaction (Supabase RPC or sequential `update`)
- Return `{ ok: true }` on success or `{ error, failedIds }`

### 3e. Saving indicator

- Small status chip in the grid toolbar area: "Saving…" (while `isPending`), "Saved" (1s after), "Error" (on fail, with retry)

### Tests
- `tests/unit/proration.test.ts` — proportional, even-split fallback, no-lines no-op, all-pipeline skip, mixed-sign handling
- `tests/unit/forecast-engine.test.ts` — add a "client-side recompute" case (already pure — adding it confirms edit cascade works)
- `tests/unit/forecast-actions.test.ts` — `updateLineAmounts` schema edge cases

### 3f. Multi-cell selection

- Click + drag: define a rectangular range (row × period)
- Shift + click on a cell: extend selection to that cell
- Shift + arrow keys (not editing): extend selection one cell at a time
- Selection state = `{ anchor: [row, col], focus: [row, col] }` in `useState` at `ForecastGrid` level
- Visual: selected cells get `bg-indigo-50 ring-1 ring-indigo-300`; anchor cell has thicker border
- Esc or click outside → clear selection
- Selection excludes section header rows; subtotal rows selectable but flagged as read-only in operations

### 3g. Copy / paste

- `Ctrl/Cmd+C` on a selection → serialize to TSV (tab-separated, newlines between rows) via `navigator.clipboard`
- Numeric cells: raw numbers (no `$`, no commas) for Excel round-trip compatibility
- `Ctrl/Cmd+V` on a focus cell → read TSV from clipboard, parse rows/cols, paste values
  - Paste area extends right/down from focus cell
  - Number parsing: strip `$`, `,`, spaces; `(123)` → `-123`
  - Non-numeric / empty cells → skipped
  - Pipeline-sourced target cells → skipped silently (toast reports count)
- Uses batched `updateLineAmounts` action

### 3h. Formulas

- Edit-mode text starting with `=` → parsed as formula
- Parser: `lib/forecast/formula.ts` — tokenise + recursive descent; supports `+ - * /`, parentheses, numeric literals, unary minus
- **No cell references** in MVP (hierarchical layout makes addressing awkward). Pure arithmetic only.
- Examples: `=1500*4` → 6000; `=(5000+250)/2` → 2625; `=-3200` → -3200
- On save: evaluate → store the resulting number. Formula text is not persisted. Documented in HANDOFF.md.
- Invalid formula → red ring on cell + `title` "Invalid formula"; don't save

### 3i. Fill-handle

- 5×5px indigo square at bottom-right of the active cell / selection range
- Drag down or right → preview outline follows mouse; on release, fill the range with the source value (constant fill — MVP)
- Pipeline-sourced cells in target range → skipped silently
- Uses batched `updateLineAmounts` action
- Series extrapolation (Excel's `2, 4, 6…`) → follow-up, not MVP

### Tests for 3f–3i
- `tests/unit/selection.test.ts` — anchor/focus normalization, range iteration
- `tests/unit/paste-tsv.test.ts` — TSV parse, number-string normalization (`$1,234.56` → 1234.56, `(500)` → -500)
- `tests/unit/formula.test.ts` — parser: arithmetic, parens, unary minus, division-by-zero, invalid input
- `tests/unit/fill-handle.test.ts` — range fill with mixed editable/pipeline cells

---

## Group 4 — Nav / display polish

- Sidebar: no change
- Detail page heading: no change
- Legend row in grid: no change (status colors same)
- Pipeline summary: will naturally show only `is_pipeline_entity=true` entities — no separate change

---

## Ordering + commit plan

| Commit | Scope | Risk |
|---|---|---|
| 1 | Migration 020 + `is_pipeline_entity` column + seed updates | Low |
| 2 | Pipeline sync: confirmed-only + revenue tracker target + third-party cost line | Medium |
| 3 | Pipeline entity filter helpers + UI wiring | Low |
| 4 | `prorateSubtotal` module + tests | Low |
| 5 | `updateLineAmounts` batched action + tests | Low |
| 6 | `InlineCell` keyboard nav | Low |
| 7 | `ForecastGrid` optimistic state + cascading recompute + subtotal edit wiring | **Medium-High** |
| 8 | Saving indicator + toast | Low |
| 9 | Formula parser + InlineCell `=` handling | Low |
| 10 | Multi-cell selection state + visual highlight | Medium |
| 11 | Copy / paste (TSV) with clipboard + number parsing | Medium |
| 12 | Fill-handle drag interaction + constant fill | Medium |
| 13 | README / HANDOFF.md update | Low |

Each commit leaves the app buildable and tests passing.

---

## Risks & open questions

1. **Closing-balance roll-forward under optimistic edits.** Today, if no explicit opening line exists, engine uses `previousClosing`. A single-cell edit in week 3 cascades to closing balances of weeks 3–18. UX impact: user may see a flicker as the chain updates. Mitigation: recompute runs synchronously in a `useMemo` — should be <5ms for 18 weeks × 50 lines.
2. **Proration on pipeline-heavy sections.** If Payroll has one manual line + one pipeline line, prorating skips pipeline → the manual line absorbs 100% of the delta. User should be aware. Covered by toast wording.
3. **Stale optimistic state on concurrent multi-user edits.** Augusto is currently single-user (test@augusto.nz); no realtime. Flag as a limitation in HANDOFF.md.
4. **Legacy forecast_lines still pointing to deleted `inflows_gst`.** FK ON DELETE defaults to RESTRICT — migration must either cascade or explicitly delete first. Plan: explicit `delete from forecast_lines where category_id = 'c0000000-...-0012'` before dropping the category.
5. **Keyboard nav across collapsed sections.** When a section is collapsed, arrow-down from the section above should skip it. Needs careful focus-target indexing.

---

## Definition of done

- All 9 commits merged to `main`
- `npx tsc --noEmit` clean except pre-existing pdf-parse errors
- `npx vitest run` 100% passing, coverage ≥ current (74 → target 90+)
- Manual E2E on `/forecast/detail`:
  - Edit a leaf cell → subtotal + section total + Net Operating + Closing + Available Cash + OD Status all update without reload
  - Press `Enter` → saves + moves down
  - Edit a subtotal → underlying lines update proportionally
  - Refresh page → persisted values match what was entered
- `/pipeline` only shows 5 entities (AUG, CNR, BAL, DD, WRS) — AGC & ENT hidden
- Confirmed pipeline projects emit into "Confirmed Revenue" inflow + "Third Party Supplier Costs" outflow on next sync
- Non-confirmed pipeline projects do NOT appear in the forecast grid

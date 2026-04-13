# Plan — Pipeline Summary Grid Affordances

**Date:** 2026-04-14
**Target:** `/pipeline/summary` (read-only BU roll-up)
**Status:** Awaiting user approval before execution.
**Related:** Mirrors a subset of `2026-04-13-excel-like-grid-enhancements.md` (P1.1, P1.5, P2.1, P3.5) adapted for a read-only aggregated table.

---

## Goals

Bring four Excel-style affordances from `/forecast/detail` to `/pipeline/summary`. This is a **read-only** table (rows are derived by `computeBUSummary`), so edit-centric features (undo/redo, fill handle, formulas, shift-by-weeks, copy-forward, split, Ctrl+D, Delete-clears, cell notes) are out of scope.

| Feature | Source on forecast grid | New location |
|---|---|---|
| Selection stats chip | P1.1 | `components/pipeline/summary-selection-stats.tsx` |
| Ctrl+F find | P1.5 | `components/pipeline/summary-find-bar.tsx` |
| Keyboard nav (Ctrl+Home/End, Ctrl+Arrow, arrows, Esc) | P2.1 | inline in `summary-table.tsx` |
| CSV export | P3.5 | `lib/pipeline/export-summary.ts` + button in page header |

**Success criteria:** all 445 existing tests still green; 4–6 new unit tests for the new helpers; typecheck clean; manual browser QA at 1280 / 1440.

---

## Ground rules

1. **Zero mutations.** No server actions touched. No new DB columns, no migrations, no type regen.
2. **No changes to `/forecast/detail` code.** The existing helpers in `lib/forecast/` stay untouched — pipeline summary gets its own parallel helpers in `lib/pipeline/` to avoid coupling the two tables. Only `lib/forecast/aggregates.ts` is reused directly (it's pure `number[]`).
3. **Cell coordinate model.** A summary cell is `(entityId, metricKey, monthIndex)` where `metricKey ∈ {confirmedAndAwaiting, upcomingAndSpeculative, totalForecast, target, variance, pnlForecast}`. The Total column is monthIndex = months.length (virtual).
4. **Selection & nav operate on visible cells only.** Collapsed entities are skipped — anchor/focus coordinates use the currently-rendered row list.
5. **Commit boundary = one task = one commit.**

---

## Task 1 — Selection + keyboard nav foundation

**Why first:** selection is the anchor that stats, find highlighting, and export-selection all depend on.

**Files**
- `lib/pipeline/summary-selection.ts` (new) — `CellRef`, `Selection`, `Range`, `cellsInRange(anchor, focus)`, `jumpToEdge(direction, current, rowCount, colCount)`. Pure, no React.
- `tests/unit/pipeline-summary-selection.test.ts` (new).
- `components/pipeline/summary-table.tsx` — lift state: `selection: Selection | null`, handlers for `onMouseDown` / `onMouseEnter` (drag), Shift+click (extend), arrow keys (move), Shift+arrow (extend), Ctrl+Home/End, Ctrl+arrow (edge-jump), Esc (clear). Render cells with `aria-selected` + `bg-blue-50` when in range. Add `tabIndex={0}` to cells and a single keydown handler on the `<table>` wrapper.

**Out of scope:** Ctrl+click (discontiguous selection). Single rectangular range only — matches the pattern used throughout the forecast grid for multi-cell ops.

**Tests**
- `cellsInRange` across single cell, single row, single col, multi-row × multi-col.
- `jumpToEdge` left/right/up/down from each corner.

---

## Task 2 — Selection stats chip

**Files**
- `components/pipeline/summary-selection-stats.tsx` (new) — takes `values: number[]`, renders `Σ / ⌀ / # / min / max` when `values.length >= 2`.
- `app/(app)/pipeline/summary/page.tsx` — wrap SummaryTable in a client container that owns the stats chip position (right of the FiscalYearNav). Or lift into `SummaryTable` so selection state stays local — **preferred**: keep everything in `SummaryTable`, render chip in a new top-right toolbar div inside the card.
- Reuse `lib/forecast/aggregates.ts#computeAggregates` directly.

**Wiring**
1. Derive `selectedValues: number[]` via `useMemo` from `selection` + the numeric row arrays.
2. Variance cells contribute their raw (possibly-negative) value.
3. Total column contributes `sumArray(row.metricValues)` for the active metric.

**Tests**
- None needed (presentational); covered by Task 1 tests + manual QA.

---

## Task 3 — Ctrl+F find

**Files**
- `lib/pipeline/summary-find.ts` (new) — `buildMatchList(rows, months, query, opts)` returns `FindMatch[]` scanning entity name, metric label, and numeric amounts (numeric-or-formatted, matching `find.ts` semantics). `normaliseAmountQuery(q)` reused logic.
- `tests/unit/pipeline-summary-find.test.ts` (new).
- `components/pipeline/summary-find-bar.tsx` (new) — overlay with input, "N of M", ↑ / ↓ / Enter / F3, "Only matching rows" toggle, Esc to close. Keybind: Ctrl/Cmd+F.
- `summary-table.tsx` — add `currentMatch` highlight (500ms yellow flash on jump) + `onlyMatching` row filter. Auto-expand any collapsed entity containing a match when user navigates to it.

**Tests**
- `buildMatchList`: entity-name hit, metric-label hit, amount hit (raw + formatted), case insensitive, "Only matching rows" excludes non-match entities.

---

## Task 4 — CSV export

**Files**
- `lib/pipeline/export-summary.ts` (new) — `buildSummaryCsv(args: { rows, months, scope, selection? })`. Scopes:
  - `all` — every entity × every metric × every month + Total + Group Total block.
  - `view` — respects `collapsed` map; excluded entities omitted.
  - `selection` — only cells inside `selection` range, emitted as a flat `entity, metric, month, value` table.
- `tests/unit/pipeline-summary-export.test.ts` (new).
- `summary-table.tsx` — "Export CSV" dropdown button (all / view / selection; selection disabled when no range). UTF-8 BOM, RFC-4180 quoting — copy pattern from `lib/forecast/export.ts`.

**Tests**
- `buildSummaryCsv`: all scope shape, view scope skips collapsed, selection scope flat shape, RFC-4180 escaping of entity names containing commas.

---

## Task 5 — Browser QA + polish

1. 1280 / 1440 layout pass — toolbar fits, chip doesn't overflow, find bar position OK.
2. Keyboard nav: arrows stop at table edges; Ctrl+Home lands on (row 0, col 0); Ctrl+End lands on (last visible row, Total col).
3. Find: navigating into a collapsed entity expands it; "Only matching rows" hides the GROUP TOTAL when no match lives there (expected).
4. Export: open all three exports in Excel — amounts right-align, entity-name commas round-trip.
5. Ensure selection + find + export compose sanely (select → Ctrl+F → Enter moves focus but keeps prior selection until a new drag/click).

---

## Risk & rollback

- **Zero migration risk.** No DB changes.
- **Zero impact on `/forecast/detail`.** Changes are additive to `lib/pipeline/` + `components/pipeline/summary-table.tsx` only.
- **Rollback = revert the commits.** No state to unwind.

## Estimate

- 5 commits (one per task).
- ~half-day focused; can be executed in a single session or split across two.
- ~200–300 new LOC (helpers + bar components + wiring).

## Out of scope (explicit)

- Editable cells on pipeline summary (the Target column is already edited on `/pipeline/targets`).
- Undo/redo — no mutations to undo.
- Fill handle, shift-by-weeks, Ctrl+D, split cell, formulas — edit-only features.
- Row grouping — entity-header rows already collapsible.
- Freeze columns — label column already `sticky left-0`; only ~12 month cols, not a pain point.
- Porting to `pipeline-grid.tsx` or `target-grid.tsx` — separate plan if/when requested.

# Plan — Excel-like Grid Enhancements (Tier 1–3)

**Date:** 2026-04-13
**Spec:** `docs/specs/2026-04-13-excel-like-grid-enhancements-design.md`
**Status:** Awaiting user approval before execution.

---

## Goals

Land 15 Excel-style features across three phases, keeping each phase independently shippable (merge-and-deploy between phases). Tier 4 (AI) is deliberately excluded.

| Phase | Tier | Items | Est. commits |
|---|---|---|---|
| P1 | Tier 1 | Aggregates · Undo/Redo · Smart fill · Shift-by-weeks · Find | 8–10 |
| P2 | Tier 2 | Ctrl+nav · Delete clears · Ctrl+D · Cell notes · Freeze cols | 5–6 |
| P3 | Tier 3 | Ref formulas · Copy forward · Split cell · Grouping · Export | 6–8 |

Each phase ends with a green typecheck + 100 % of the relevant new unit tests passing, and all 273+ existing tests green.

---

## Ground rules (apply to every task)

1. **Optimistic-first.** Local state update → `startTransition(() => serverAction(...))` → revert on error. Every new mutation calls `revalidateForecast()` via the existing helper.
2. **Pipeline-safe.** Every write path filters `line.source === 'pipeline'` with the same helper used by `saveUpdates` / `handleSetStatus`.
3. **Undo-aware (from P1.2 onward).** Every mutation produces an `UndoEntry` pushed through a single `pushUndo()` call.
4. **One new `useCallback` per handler.** Keep dep arrays explicit.
5. **Tests first for pure helpers.** Component wiring can be validated manually.
6. **Commit boundary = one task = one commit.** Subagent-friendly.

---

# Phase 1 — Tier 1 primitives

## P1.1 — Selection aggregates

**Files**
- `lib/forecast/aggregates.ts` (new) — pure helper returning `{ sum, avg, count, min, max }` for a set of numeric values.
- `tests/unit/aggregates.test.ts` (new).
- `components/forecast/forecast-grid.tsx` — derive values from `selectedCellKeys` + `flatRows` + `localLines` + `periods` inside a `useMemo`; add `<SelectionStatsChip />` in the controls bar beside `SaveStatusChip`.

**Tasks**
1. Create `aggregates.ts` with `computeAggregates(values: number[]): Aggregates` + tests covering empty / single / mixed-sign inputs.
2. In grid, build a memoised `selectedValues: number[]` from `selectedCellKeys` — item rows contribute the line amount (or 0 for empty cells), subtotal rows contribute their per-period total, header/pipeline cells skipped.
3. Render `SelectionStatsChip` only when `selectedCellKeys.size >= 2`; otherwise render nothing.
4. Manual QA: drag a range of 12 cells across two item rows, confirm chip matches hand count.

**Tests**
- `aggregates.test.ts`: 6 cases (empty, one cell, many cells, mixed sign, all zeros, rounding).

---

## P1.2 — Undo / Redo

**Files**
- `lib/forecast/undo.ts` (new) — ring buffer, entry union, push/pop/replay helpers.
- `tests/unit/undo.test.ts` (new).
- `app/(app)/forecast/actions.ts` — add `bulkAddForecastLines(payload)` for deleted-line restoration.
- `components/forecast/forecast-grid.tsx` — wire `pushUndo` into every existing mutation; add `Ctrl+Z` / `Ctrl+Y` handling; render optional "Undo last" button next to the status chip.

**Tasks**
1. Define `UndoEntry` union + `UndoStack` with `push`, `undo`, `redo`, `size`, `peek` methods. Ring depth 100.
2. Add `bulkAddForecastLines` server action — zod array ≤ 500, scope check via entity ids, RLS insert, revalidate.
3. Convert existing handlers to record an entry:
   - `saveUpdates` → `amounts` entry (forward = new, inverse = `old`).
   - `handleEmptyCellCreate` / `handleEmptySubtotalCreate` → `created` entry (post-replace swap captures `realId`).
   - `handleSetStatus` → `status` entry (prev Map already exists).
   - `handleSubtotalSave` via `prorateSubtotal` → reuses the `amounts` path, same entry.
4. Keyboard binding in `handleGridKeyDown`: `Ctrl+Z` → `undoStack.undo()` + dispatch replay; `Ctrl+Shift+Z` / `Ctrl+Y` → `redo`.
5. Replay router — one function per `kind`, calls the matching server action, no new entries pushed (guarded by `isReplayingRef`).
6. Visual feedback: mutate `saveStatus` to show "Undone" for 1.5 s.

**Tests**
- `undo.test.ts`: push/undo/redo cycle, ring eviction at depth 100, redo cleared on new push, inverse composition for `amounts` + `status`.

**Manual QA checklist**
- Paste 5 cells, Ctrl+Z → all 5 revert. Ctrl+Y → re-apply.
- Create line via empty-cell typing, Ctrl+Z → row disappears and status chip says "Undone".
- Bulk status on 8 cells, Ctrl+Z → all 8 revert to prior statuses (not a single blanket).
- Undo after scenario switch → skip entry, chip says "Skipped: scenario changed".

---

## P1.3 — Smart fill handle

**Files**
- `lib/forecast/fill-handle.ts` — add `detectPattern(cells)`, `materialisePattern(pattern, targetCount)`, extend existing `computeFillHandleRange` return with a `pattern` field.
- `tests/unit/fill-handle.test.ts` — extend with series + double-click cases.
- `components/forecast/forecast-grid.tsx` — wire double-click on the fill-handle span to a new `handleFillDoubleClick()`; update existing drag-commit to use `pattern` instead of always repeating the source value.

**Tasks**
1. Implement `detectPattern(sourceCells: Array<{row, col, amount}>)` returning `{type:'constant'|'series', ...}`. Constant-delta tolerance 0.01. Series only triggers when source is 1-row or 1-col shape and has ≥ 2 numeric cells.
2. `materialisePattern(pattern, n)` returns `number[]` of length `n`.
3. Double-click handler: compute "bottom of current section" by walking `flatRows` from `selection.focus.row` forward until `fr.kind === 'sectionHeader'` or end of array; use that as the target `rowEnd`. Commit fill.
4. Update drag-commit to `materialisePattern(detectPattern(source), targetCount)`.

**Tests**
- `fill-handle.test.ts` new cases: detect constant, detect positive + negative deltas, reject mixed deltas, reject 2D source, fill 5 rows from `[100,110]` → `120..160`.

---

## P1.4 — Shift by N weeks

**Files**
- `lib/forecast/shift-by-weeks.ts` (new) — pure planner: given selection + N, return `{ updates, creates, clears, collisions }`.
- `tests/unit/shift-by-weeks.test.ts` (new).
- `app/(app)/forecast/actions.ts` — reuse `updateLineAmounts`, add `bulkAddForecastLines` from P1.2 for creates; no new action.
- `components/forecast/forecast-grid.tsx` — add `Alt+←` / `Alt+→` keyboard handler; add "Shift…" button in controls bar with a small inline popover.

**Tasks**
1. Planner walks `selectedCellKeys` → per cell, look up source line; compute target `(row, col+N)`; classify as update (target has editable line) / create (target empty) / skip (target out of range or pipeline).
2. Aggregate collisions (non-zero targets) for the UI confirm.
3. Wire keyboard: `Alt+→` fires `runShift(+1, {autoConfirm: true})`; button opens popover for arbitrary N with confirm step.
4. Batched commit: one `updateLineAmounts` + one `bulkAddForecastLines` wrapped in one `UndoEntry` of kind `amounts` + `created` tuple. Undo rolls both back.

**Tests**
- Planner unit tests: one-cell shift, multi-cell shift with collisions, out-of-range skip, pipeline skip, negative N.

---

## P1.5 — Find (Ctrl+F)

**Files**
- `lib/forecast/find.ts` (new) — `buildMatchList(flatRows, localLines, periods, query) → Array<{row, col?}>` plus `nextMatch` / `prevMatch` cursors.
- `tests/unit/find.test.ts` (new).
- `components/forecast/find-bar.tsx` (new) — the floating overlay component.
- `components/forecast/forecast-grid.tsx` — mount `<FindBar />` behind a `findOpen` state; `Ctrl+F` opens, `Esc` closes; expose `setSelection(collapseTo(match))` on navigation; "Only matching rows" checkbox sets a `filterRowSet: Set<number>` consumed by `SectionBlock` when filtering.

**Tasks**
1. Pure match builder — case-insensitive counterparty / notes substring, numeric-equality-or-formatted-substring match on cell amounts. Normalise `$`, `,`, and `()` before compare.
2. `<FindBar />`: search input, `↑/↓` buttons, `N of M` counter, close button. `Enter` = next, `Shift+Enter` = prev.
3. Grid wiring: on next match, scroll cell into view (`scrollIntoView({block:'nearest'})`), flash yellow ring via a short-lived `highlightKey` state that `SectionBlock` reads.
4. "Only matching rows": build `filterRowSet` from match list (expand to full row), pass into `buildFlatRows` (skip logic). Clearing the input resets the filter.
5. Auto-expand collapsed sections containing matches.

**Tests**
- `find.test.ts`: empty query → no matches, counterparty hit, numeric hit, formatted-amount hit ("$1,500" → amount 1500), no-match path.

---

## P1 checklist

- [ ] Unit tests added and all 273+ existing tests still pass
- [ ] `npx tsc --noEmit` clean
- [ ] Manual QA each of 1.1–1.5 per per-phase checklist above
- [ ] Update `docs/CLAUDE.md` with new keyboard map
- [ ] Commit per task; push to `main`

---

# Phase 2 — Tier 2 cleanup

## P2.1 — Ctrl navigation

**Files**
- `lib/forecast/selection.ts` — add `jumpToEdge(row, col, dir, flatRows, lines, periods)` helper.
- `tests/unit/selection.test.ts` — extend.
- `components/forecast/forecast-grid.tsx` — `handleGridKeyDown` handles `Ctrl+Home` / `Ctrl+End` / `Ctrl+Arrow` branches.

**Tasks**
1. `jumpToEdge` walks cells in direction while `amount !== 0`; stops when value flips to zero or grid edge hit. Standard Excel semantics.
2. Keyboard wiring.

**Tests**
- Edge-jump with non-zero run, with first cell zero (→ jumps to first non-zero), at grid edges.

---

## P2.2 — Delete clears selection

**Files**
- `components/forecast/forecast-grid.tsx` — new `handleDeleteSelection`, bind to `Delete` / `Backspace` when grid has focus.

**Tasks**
1. Build `updates` = each non-pipeline cell in `selectedCellKeys` with `{ id, amount: 0 }`. Call `saveUpdates(updates)`.
2. Pipeline cells and empty cells silently skipped. No confirmation (matches Excel).
3. Push `amounts` undo entry (auto, already wired from P1.2).

---

## P2.3 — Ctrl+D duplicate to next column

**Files**
- `components/forecast/forecast-grid.tsx` — new `handleDuplicateRight`.

**Tasks**
1. For each selected cell, plan target = `(row, col+1)`. Reuse shift-by-weeks planner with `N=1, clearSource=false`.
2. `Ctrl+D` key binding. One undo entry.

---

## P2.4 — Cell notes indicator

**Files**
- `components/forecast/inline-cell.tsx` — accept optional `note?: string`; render a 6×6 amber dot `absolute top-0.5 right-0.5` when present; native `title` tooltip with counterparty + note.
- `components/forecast/forecast-grid.tsx` — pass `note={cellLine?.notes}` in item cell render.

**Tasks**
1. Add `note` prop and render dot.
2. Tooltip format: `` `${counterparty ?? ''}\n${note}` `` (line break in title).

No server work, no schema change.

---

## P2.5 — Freeze columns toggle

**Files**
- `components/forecast/forecast-grid.tsx` — add `freezeCount` state synced to `localStorage['forecast.freezeCount']` via a small custom hook `useLocalStorageInt`.
- `components/forecast/forecast-row.tsx` (and any per-row rendering) — apply cumulative `sticky` left offsets when `colIdx < freezeCount`.

**Tasks**
1. Compute per-col left offset at render time (existing `<th>` widths via `useLayoutEffect` measuring `scrollWidth` on first mount — fall back to `140px` per col as a fail-safe).
2. Dropdown in controls bar with three options.
3. Drop to "Label only" gracefully on narrow viewports (<1280 px) — detect via `matchMedia`.

**Risk.** Sticky-on-sticky layout can fight z-indexing. Test at 1280, 1440, 1920 widths before ship.

---

## P2 checklist

- [ ] Unit tests for jumpToEdge, duplicate planner
- [ ] Typecheck + 100 % tests green
- [ ] Manual QA: Delete, Ctrl+D on 3-cell selection, cell-notes dot on document-imported rows
- [ ] Ship

---

# Phase 3 — Tier 3 heavy lifts

## P3.1 — Cell-reference formulas

**Files**
- `supabase/migrations/023_forecast_line_formula.sql` — `ALTER TABLE forecast_lines ADD COLUMN formula text`.
- `lib/forecast/formula.ts` — extend parser with cell-range tokens `W\d+(:W\d+)?`, row refs `@[A-Za-z ]+(:W\d+)?`, functions `SUM`/`AVG`/`MAX`/`MIN`/`IF`.
- `lib/forecast/dep-graph.ts` (new) — build directed graph of formula cells; topological order for recompute; cycle detection.
- `tests/unit/formula.test.ts` — extend; `tests/unit/dep-graph.test.ts` (new).
- `app/(app)/forecast/actions.ts` — extend `updateLineAmounts` to accept optional `formula` per update (stored alongside amount).
- `app/(app)/forecast/schemas.ts` — `formula: z.string().max(500).optional()` on each update.
- `components/forecast/inline-cell.tsx` — when a line has a formula, show `=` prefix indicator; on edit, load the formula text into the draft rather than the number; on `commitDraft`, call `evaluateFormula` and pass both `amount` + `formula` up.
- `components/forecast/forecast-grid.tsx` — after each save, re-evaluate downstream formulas via dep-graph; queue dependent `amounts` updates into the same batch.

**Tasks**
1. Migration (new column, nullable, indexed `WHERE formula IS NOT NULL` — small optimisation for rendering).
2. Parser tokens: `W<n>` (this-row) and `@<label>` (row lookup); ranges `:`; function-call syntax.
3. Dep-graph builder — per-render scan of all lines with `formula !== null`; store `Map<lineId, Set<dependencyLineId>>`.
4. Cycle detection on save — if proposed formula introduces a cycle, reject with inline error.
5. Recompute cascade — on save, topological walk from edited cells; stop when amount diff < 0.01.
6. UI: `=` indicator, hover shows the formula text, `F2` on a formula cell edits the formula (not the number).

**Migration rollback**: `ALTER TABLE forecast_lines DROP COLUMN formula;` — safe, no data dependency elsewhere.

---

## P3.2 — Copy week forward N weeks

**Files**
- `components/forecast/forecast-grid.tsx` — "Copy forward…" button in controls bar, uses shift-by-weeks planner with `clearSource=false` and `N=<userInput>`; iterates N times, one undo entry total.

Trivial on top of P1.4 — ~30 lines.

---

## P3.3 — Split cell across weeks

**Files**
- `components/forecast/forecast-grid.tsx` — right-click handler on item cells with a value; modal component `<SplitCellModal />` (new, small) prompts for comma-separated numbers.
- `lib/forecast/split-cell.ts` (new) — plan `{updates, creates}` given a source cell + array of amounts.
- `tests/unit/split-cell.test.ts` (new).

**Tasks**
1. Parse `"4000, 6000, 2000"` → `[4000, 6000, 2000]`, reject non-numeric entries.
2. Plan: first value overwrites source, rest spill into next N-1 periods (update or create). Collision warning if any target has a value.
3. One undo entry.

---

## P3.4 — User-defined row grouping

Reassess at start of Phase 3. If Phase 3.1 (formulas) lands cleanly and time permits, implement; otherwise split to a follow-up plan.

Key design: groups stored in localStorage as `{ [subcategoryId]: Array<{ label, rowKeys: string[], collapsed: boolean }> }`. On render, `buildFlatRows` inserts synthetic group-header rows above the member rows. No server impact.

---

## P3.5 — Export

**Files**
- `lib/forecast/export.ts` (new) — assemble CSV from `flatRows` + `localLines` + `periods`; respects scope (selection / view / all).
- `components/forecast/forecast-grid.tsx` — menu button; triggers `download(blob, filename)`.
- `tests/unit/export.test.ts` (new).

**Tasks**
1. Build CSV with header row (label + each period's `weekEnding`), data rows per item, subtotals, and the net-operating / closing rows.
2. UTF-8 BOM for Excel compatibility.
3. Selection / view / all scoping.

---

## P3 checklist

- [ ] Migration applied locally + remote
- [ ] Unit tests for parser, dep-graph, split, export
- [ ] Typecheck + full suite green
- [ ] Manual QA each feature
- [ ] Ship

---

# Testing + verification (applies to every phase)

Before each commit:

```bash
npx tsc --noEmit
npx vitest run
```

Both must be clean. No `npm run lint` dirty files. Never commit with pipeline-only regressions.

---

# Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| Undo entry coverage incomplete | P1.2 | Coverage audit: grep for `saveUpdates\|setLocalLines\|startTransition` in grid; each must be wrapped. |
| Formula dep-graph cycles freeze the UI | P3.1 | Hard cap at 50 levels; surface "Too deep" chip. |
| Freeze columns break header alignment | P2.5 | Visual regression check at 3 widths before shipping. |
| localStorage growth from grouping | P3.4 | Cap total serialised size at 32 KB; surface "grouping full" chip. |
| Find + hideEmpty interaction | P1.5 | Explicit rule: Find auto-expands collapsed sections and bypasses hideEmpty for matched rows. |

---

# Out of scope (reaffirmed)

- AI suggestions / projection (Tier 4)
- `Ctrl+H` replace
- Cell-note editing UI
- Column width resizing, zoom
- Multi-user collaborative editing / presence

---

# Execution order

Recommended sequence per phase:

**P1**: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 (undo must land before shift/find because those push entries)

**P2**: 2.4 → 2.2 → 2.3 → 2.1 → 2.5 (notes first — zero risk; freeze cols last — highest layout risk)

**P3**: 3.5 → 3.3 → 3.2 → 3.1 → 3.4 (export first — standalone; formulas last — biggest lift)

---

# Success criteria

- Zero regressions in the existing 273-test suite.
- `npm run build` succeeds on each phase.
- Manual QA per-phase checklist signed off by Jack before merge.
- Vercel deploy green.
- Staff (Yasmine) can use each new feature without reading documentation — UI discoverability is the acceptance bar, not technical correctness.

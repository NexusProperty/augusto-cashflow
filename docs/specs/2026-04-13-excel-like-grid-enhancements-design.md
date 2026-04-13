# Excel-like Grid Enhancements — Design Spec

> Draft 2026-04-13. Extends the `/forecast/detail` grid with Tier 1–3 Excel-style features. Supersedes nothing; purely additive to what Yasmine Round 2 (2026-04-13) shipped.

---

## Problem

The forecast grid already supports cell edits, formulas, TSV paste, fill-handle, rectangular selection, shift/ctrl multi-select, bulk status change, and empty-subtotal creation. It is still missing a tier of Excel primitives that staff assume exist — absence of any one of them forces them back into the source Excel workbook. The five biggest gaps surfaced in the 2026-04-13 conversation:

1. No at-a-glance **aggregate stats** when a range is selected. Users drop back to Excel to Sum a column.
2. No **undo / redo** — a mis-paste or wrong status change is permanent unless the user remembers the old value.
3. **Fill handle** only ever repeats the same number. Excel's double-click-to-fill and series detection are both absent.
4. No native way to **shift a payment / receipt by N weeks**. Currently requires copy-paste across two cells plus a clear.
5. No **Find**. Staff scroll the entire 18-week grid hunting for a counterparty.

A second tier (`Ctrl+arrow` navigation, range-delete, row duplication, cell notes, extra freeze columns) closes smaller paper cuts. A third tier (cell-reference formulas, bulk "copy this week forward N weeks", cell splitting, user-defined grouping, export) fills in the heavier Excel parity work.

AI-assisted functions (projection, suggested values) are **out of scope** for this spec — deliberately excluded so the grid stays a deterministic, reviewable tool.

## Principles

- **Optimistic first, revalidate second.** All mutations apply locally, fire a server action wrapped in `startTransition`, and revert on error — matching the pattern laid down by the recent `updateLineAmounts` + `revalidateForecast` work.
- **One selection model.** Reuse the existing rectangular `Selection` plus `extraSelected: Set<"row:col">` union. Do not introduce a third selection type.
- **Keyboard-first.** Every new feature has a keyboard shortcut that matches Excel/Google Sheets. Pointer equivalents are secondary.
- **Pipeline cells stay read-only.** Every new write path filters `line.source === 'pipeline'` the same way the existing `saveUpdates` / `handleSetStatus` do.
- **Scope-safe.** Every server action goes through `assertForecastLinesInScope` exactly once (RLS + explicit check).

---

## Tier 1 — High-leverage primitives

### 1.1 Selection aggregates (Sum / Avg / Count / Min / Max)

**UI.** A new `SelectionStatsBar` chip rendered in the existing controls row next to `SaveStatusChip`. Shows only when `selectedCellKeys.size >= 2`.

```
  ∑ $42,318   ⌀ $3,527   #12   ↑ $12,000   ↓ $0
```

Compact. Values follow existing `formatCurrency` rules (thousands, negatives red).

**Computation.** Walk `selectedCellKeys`:
- Item-row cells: contribute `line.amount ?? 0`. Empty cells (no line) contribute 0 and count toward `Count` as a zero-value cell.
- Subtotal-row cells: contribute the displayed subtotal for that period.
- Header rows: skipped.

Memoised on `[selectedCellKeys, localLines, periods, categories]`.

**Cost.** Tiny. One component, one `useMemo`. No server work.

---

### 1.2 Undo / Redo

**Scope.** Covers every user-initiated mutation that produces a server write:
- Cell amount edits (single + batched from paste/fill)
- Empty-cell creates and empty-subtotal creates
- Status changes (single + multi-cell)
- Subtotal prorations
- Range clears (Tier 2.7)

Pipeline-sourced updates, scenario overrides, and document-driven confirms are **not** tracked — they flow through different actions and have their own audit surfaces.

**Model.** A client-side ring buffer of **inverse commands**:

```ts
type UndoEntry =
  | { kind: 'amounts'; forward: AmountUpdate[]; inverse: AmountUpdate[]; label: string }
  | { kind: 'status'; ids: string[]; prev: Map<string, LineStatus>; next: LineStatus; label: string }
  | { kind: 'created'; tempId: string; realId: string | null; label: string }
  | { kind: 'deleted'; lines: ForecastLine[]; label: string }
```

- Ring depth: `UNDO_DEPTH = 100` entries.
- Redo stack cleared on any new mutation (standard Excel behaviour).
- Stored in a `useRef` — does **not** survive page reload (acceptable; Excel doesn't persist undo across closes either).
- Labels shown in the bar (e.g. "Undo — paste 12 cells"), keyboard-triggered undo also fires a one-second save-chip style toast.

**Keyboard.** `Ctrl+Z` / `Cmd+Z` = undo, `Ctrl+Shift+Z` / `Ctrl+Y` = redo. Suppressed when focus is inside an input.

**Server contract.** Undo replays the inverse via existing server actions:
- `amounts` inverse → `updateLineAmounts({ updates: inverse })`
- `status` inverse → `bulkUpdateLineStatus({ ids, status: prev })` called once per distinct `prev` value
- `created` inverse → new `deleteForecastLine(realId)`
- `deleted` inverse → bulk `addForecastLine` (new `bulkAddForecastLines` action for multi-line inserts)

**Race handling.** If inverse fails (line already deleted by a collaborator, out of scope), surface error in the save chip, push the entry onto a `failedUndoLog` for visibility, and leave state as-is.

---

### 1.3 Smart fill handle

Two orthogonal improvements to `lib/forecast/fill-handle.ts`:

**1.3a Double-click → fill to section boundary.** On mousedown of the handle with a double-click flag, instead of entering drag mode, compute the target range as "from the bottom of the current selection down to the last item row in the same section whose sibling cell (same column as the left edge of selection) has a value". Commit the fill immediately. Matches Excel behaviour 1:1.

**1.3b Linear series detection on drag.** When the source selection contains ≥ 2 cells in a single row or single column with a **constant delta** (`cells[i+1].amount - cells[i].amount` equal for every adjacent pair, tolerance 0.01), extrapolate during drag rather than repeat:

```
[100, 110]  drag down 3 → 120, 130, 140
[0, 5000]   drag right 4 → 10000, 15000, 20000, 25000
```

Fallback to constant fill when:
- Source has fewer than 2 numeric cells
- Deltas are inconsistent
- Source spans multiple rows AND multiple columns

Store detected series as `{ type: 'series', start, delta }` or `{ type: 'constant', value }` on the fill descriptor returned by `computeFillHandleRange`. Existing paste-style cell writes remain unchanged.

---

### 1.4 Shift by N weeks

**UX.** Select one or more cells. Trigger via:
- `Alt+→` / `Alt+←` (one week each way)
- A "Shift…" button in the controls bar that opens a small popover asking N (signed integer) and confirms.

**Semantics.** For each selected cell with a non-pipeline line and a non-zero amount:
- Target period = period at `(col + N)`. If out of range, skip that cell.
- Target cell: if it has a line → overwrite `amount`. If empty → create a line cloned from the source (entity, category, counterparty, notes) at the target period.
- Source cell: set `amount = 0` (use `onCellClear` semantics — preserves the line row for history).

**Collision warning.** If any target cell already has a non-zero value, surface a confirmation: *"3 target cells already have values. Overwrite?"* Keyboard path (`Alt+→`) auto-overwrites without the prompt (matches Excel's shift behaviour); button path prompts.

**Server.** One batched `updateLineAmounts` (for existing-line writes) + one bulk create (for empty-target writes) — wrapped together in a single undo entry so one `Ctrl+Z` rolls back the whole shift.

---

### 1.5 Find (Ctrl+F)

**UI.** An overlay bar anchored to the top-right of the grid that appears on `Ctrl+F` / `Cmd+F`. Fields:
- Search input (text)
- Match count: `3 of 17`
- `↑ ↓` buttons (prev / next match)
- "Only matching rows" checkbox — hides non-match rows (works on top of hideEmpty)
- Close button (Esc also closes)

**Search domain.** Every visible `item` row, searching:
- `counterparty` (case-insensitive contains)
- `notes` (case-insensitive contains)
- `amount` (numeric equality after stripping `$`, `,`, and parens; or raw substring match on the formatted value)

**Navigation.** `Enter` / `F3` → next; `Shift+Enter` / `Shift+F3` → prev. Each match flashes a yellow ring on the matched cell(s) and scrolls it into view.

**Out of scope.** Replace (i.e. `Ctrl+H`). Add later if asked.

---

## Tier 2 — Smaller navigation + cleanup wins

### 2.1 `Ctrl+Home` / `Ctrl+End` / `Ctrl+Arrow`

- `Ctrl+Home` → first focusable cell (row 0 that passes `isFocusable`, col 0).
- `Ctrl+End` → last focusable cell.
- `Ctrl+ArrowKey` → jump to the edge of the contiguous non-zero region in the direction of travel, or to the grid edge if already at one. "Contiguous" = walking cell-by-cell while `amount !== 0`. Standard Excel semantics.

### 2.2 `Delete` clears selection

On `Delete` / `Backspace` when the grid has focus (not an input) and `selectedCellKeys.size >= 1`: build an `updateLineAmounts` payload of `{ id, amount: 0 }` for every selected non-pipeline cell with a line. One server call; one undo entry.

### 2.3 `Ctrl+D` duplicate to next column

Copy every selected cell's amount to the cell one column to the right on the same row. Uses same overwrite semantics as Shift-by-N. One undo entry.

### 2.4 Cell notes indicator

- Display: small 6×6 amber dot in the top-right of any cell whose `line.notes` is non-empty.
- Hover: native `title` tooltip showing the note and the counterparty.
- Edit: out of scope for this phase; notes today come from document imports and `= Invoice: …` boilerplate.

### 2.5 Extra-frozen columns

A `Freeze columns` dropdown in the controls bar. Values: `Label only` (current) / `Label + 1 week` / `Label + 2 weeks`. Setting persists in `localStorage` as `forecast.freezeCount`. Technical: apply cumulative `sticky left-[Xpx]` on the first N week columns plus the existing label column, pre-computed from each `<th>` width at mount.

---

## Tier 3 — Heavier lifts

### 3.1 Cell-reference formulas

**Grammar (extension of `lib/forecast/formula.ts`).** Adds cell-range tokens on top of the current arithmetic parser:

```
=SUM(W3:W6)        // columns W3..W6 inclusive, same row
=SUM(W3:W6, W10)   // mixed ranges + single cells
=AVG(W3:W6)
=MAX(W3:W6) / =MIN(W3:W6)
=@Payroll:W3       // explicit row reference, counterparty-keyed
```

Column tokens `W1…Wn` map to `periods[n-1].id`. Row tokens default to the current row; `@Counterparty` switches row.

**Storage.** New nullable column `forecast_lines.formula text`. Evaluated on write; `amount` remains the source of truth (formula is derivable / cached view).

**Dependency graph.** Built client-side from formulas at render time. On any cell save, re-evaluate downstream formulas and queue them into the same `saveUpdates` batch. Cycle detection → error chip.

**Security.** Pure expression parser — no identifiers outside the fixed function set, no member access, no template strings. Same approach as existing `evaluateFormula`.

**Migration.** New column, no data backfill. Existing `=a+b` formulas continue to work (they don't use refs).

### 3.2 Copy week forward N weeks

Select a column (or cells within a column). "Copy forward" button prompts for N. For each selected cell, write its value to the next N periods. Skips pipeline cells. Creates lines for empty targets. One undo entry.

### 3.3 Split cell across weeks

Right-click a cell with a value → "Split…" → modal with an input parsing comma-separated numbers. First value replaces the source cell; subsequent values spill into the next (N-1) periods on the same row. Creates lines for empty targets. One undo entry.

### 3.4 User-defined row grouping

Select ≥ 2 item rows within the same sub-category → "Group" button → a collapsible parent row appears above them titled with the user's label. Group definitions stored per-user in `localStorage` keyed by `group_id` + sub-category-id. Collapse state also in localStorage.

**Deferred if layout rework is too invasive** — reassess after 3.1 lands.

### 3.5 Export

Button in the controls bar with a menu:
- Export **selection** (disabled when selection is empty)
- Export **current view** (respects hideEmpty + collapsed state)
- Export **entire forecast** (full data)

Uses existing `toTSV` for grid shape. CSV output with UTF-8 BOM, `content-disposition: attachment`, filename `augusto-cashflow-<scenario?>-<YYYY-MM-DD>.csv`. No server round-trip — assembled in the browser from `localLines`.

---

## Data model changes

| Change | Phase | Migration | Notes |
|---|---|---|---|
| `forecast_lines.formula text NULL` | 3.1 | `023_forecast_line_formula.sql` | Allows cell-reference formulas to persist. |
| `bulkAddForecastLines` server action | 1.2 (undo) + 1.4 (shift) | N/A | Parallels `addForecastLine`, accepts `Array<Omit<ForecastLineInsert,'id'>>`, RLS-scoped. |
| `bulkClearForecastLines` helper | 1.2 (undo) + 2.2 (delete) | N/A | Calls `deleteForecastLine` under the hood. |

No RPC changes. All mutations continue to flow through existing server actions.

---

## Keyboard map (final state)

| Keys | Action | Notes |
|---|---|---|
| `Enter` / `Shift+Enter` | Move down/up | existing |
| `Tab` / `Shift+Tab` | Move right/left | existing |
| `Esc` | Cancel edit / clear selection | existing (updated to clear extras) |
| `F2` | Edit without overwriting | existing |
| `=` | Enter formula mode | existing |
| `Ctrl+C` / `Ctrl+V` | Copy / paste TSV | existing |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo | **new 1.2** |
| `Ctrl+F` | Find overlay | **new 1.5** |
| `Ctrl+Home` / `Ctrl+End` | Top-left / bottom-right | **new 2.1** |
| `Ctrl+Arrow` | Jump to region edge | **new 2.1** |
| `Alt+→` / `Alt+←` | Shift selection ±1 week | **new 1.4** |
| `Ctrl+D` | Duplicate to next column | **new 2.3** |
| `Delete` / `Backspace` | Clear selection | **new 2.2** |
| `Ctrl+Click` | Toggle cell in selection | existing (2026-04-13) |
| `Shift+Click` / `Shift+Arrow` | Extend rectangular selection | existing |

---

## Testing strategy

- **Unit.** Every pure helper ships with tests. New files:
  - `lib/forecast/aggregates.ts` + test (Tier 1.1)
  - `lib/forecast/undo.ts` + test — ring buffer semantics, inverse composition (1.2)
  - Extension of `lib/forecast/fill-handle.ts` + tests for series detection + double-click bounds (1.3)
  - `lib/forecast/shift-by-weeks.ts` + test — collision detection, boundary skips, source/target pairing (1.4)
  - `lib/forecast/find.ts` + test — tokeniser, match walking (1.5)
  - Extension of `lib/forecast/formula.ts` + tests — ref tokens, range expansion, cycle detection (3.1)
- **Integration.** Vitest smoke tests against the real grid component are out of scope (we rely on shape tests).
- **Manual.** Playwright-less walkthrough for each phase documented in the plan.

## Risks

- **Undo complexity.** Multi-step operations (paste, fill, shift) must push **one** entry. Tested explicitly.
- **Formula dep graph (3.1)** can blow up if circular or deep. Cap dependency depth at 50; surface cycle errors inline.
- **Freeze columns (2.5)** may fight with sticky header on small viewports — test at 1280 and 1440 widths.
- **localStorage drift** for grouping + freeze count — stale keys will simply be ignored; no migrations needed.

## Out of scope

- AI-assisted value suggestions, projection from actuals (Tier 4)
- `Ctrl+H` replace
- Cell notes editing UI (display only for this cycle)
- Column width resizing
- Zoom

## Decisions (2026-04-13)

1. **Undo across scenario switches.** Record `scenarioId` on each entry. Replay only if current scenario matches; otherwise skip the entry and surface a `Skipped: scenario changed` chip.
2. **Freeze count default.** `Label only` (current behaviour). User opts in via the new dropdown.
3. **Find scope.** Auto-expand collapsed sections that contain matches. Matches Excel; prevents silent hit-hiding.

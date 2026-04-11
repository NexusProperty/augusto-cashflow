# Cash Flow Table Redesign — Design Spec

> Approved 2026-04-12. Redesigns the forecast grid, adds a dashboard overview, and fixes pipeline summary styling.

---

## Problem

The current cash flow forecast grid is a dense wall of $0 cells that serves neither management (who need a quick read on cash position) nor the accounting team (who need to edit line items). Specific issues:

1. **$0 noise** — 90% of cells show $0, burying the 10% with actual data
2. **No visual hierarchy** — section headers blend with data rows
3. **"null." prefix bug** — Insurance, Paul Smith Loan, People's Choice show as "null. Insurance" etc.
4. **No collapsing** — empty sections take full space
5. **No dashboard** — the grid is the only view, forcing management through spreadsheet-level detail
6. **Pipeline summary formatting** — wrong thousands separator (25.000 vs 25,000), dashes everywhere, flat entity layout

## Approach

Split the forecast page into two views:

1. **Dashboard** (default) — summary cards, closing balance chart, condensed weekly table. Read-only. For management.
2. **Detail Grid** (linked from dashboard) — the editing grid, redesigned with collapsible sections, hide-empty-rows, colour-coded headers. For accounting.

Both views plus the pipeline summary use the **Catalyst / Tailwind Plus design language**: light background, shared-border cards, `zinc-950/5` dividers, Catalyst table patterns.

---

## Dashboard Design (Style E — Light Cards with Shared Borders)

### Layout

A single white rounded card (`bg-white rounded-xl border border-zinc-200`) containing three stacked sections separated by `divide-zinc-100` borders:

### Section 1: Stats Row

Four stat cells in a `grid-cols-4 divide-x divide-zinc-100` row:

| Stat | Value | Detail |
|------|-------|--------|
| Cash Position | Closing balance of current/most recent week | Red if negative. Shows week ending date below. |
| Available Cash | Closing balance + OD facility limit | Green. Progress bar showing % of OD used. Percentage label. |
| Weeks to Breach | Count of weeks until available cash < 0 | Green "None" if clear. Red number + "weeks" if approaching. |
| Pipeline — [Month] | Sum of confirmed + awaiting pipeline for current month | Amber. Progress bar showing % of monthly group target. |

Each cell: `px-5 py-5`, label in `text-xs font-medium text-zinc-500`, value in `text-2xl font-bold tabular-nums`, detail below.

### Section 2: Two-Column — Chart + Pipeline Breakdown

Left (2/3 width): **Closing Balance Trend** — bar chart showing closing balance per week across the 18-week horizon. Blue gradient bars, fading for projected weeks. Actual weeks use full opacity, forecast weeks use reduced opacity.

Right (1/3 width): **Pipeline by Stage** — stacked progress bars showing confirmed, awaiting, upcoming, speculative amounts with labels and values. Uses stage colours (emerald/amber/sky/rose).

### Section 3: Condensed Weekly Table

Catalyst-style table with 5 rows only:

| Row | Colour | Notes |
|-----|--------|-------|
| Inflows | Green for non-zero | Dash for zero weeks |
| Outflows | Red for non-zero | Dash for zero weeks |
| Loans & Financing | Default | Dash for zero weeks |
| **Closing Balance** | **Dark bar** (`bg-zinc-900 text-white`) | Red-tinted text for negative |
| Available (OD) | Green | Always shown |

Column headers: short date format (`27 Mar`, `3 Apr`), not `w/e 27 Mar`.

"View Full Detail" link at top-right navigates to the detail grid.

---

## Detail Grid Redesign

### Page Header

Row with title ("Cash Flow Detail"), subtitle ("Augusto Group — 18-week rolling forecast"), and controls:
- "Hide empty rows" checkbox (default: checked)
- "Weighted by confidence" checkbox
- Scenario dropdown (Base/Best/Worst Case)

### Section Headers — Colour-Coded & Collapsible

Each section (Opening, Inflows, Outflows, Loans) gets a distinct header row:

| Section | Background | Text colour | Chevron colour |
|---------|-----------|-------------|----------------|
| Opening Bank Balance | `bg-zinc-50/80` | `text-zinc-700` | `text-zinc-400` |
| Operating Inflows | `bg-emerald-50/50` | `text-emerald-700` | `text-emerald-500` |
| Operating Outflows | `bg-rose-50/40` | `text-rose-700` | `text-rose-400` |
| Loans & Financing | `bg-zinc-50/80` | `text-zinc-500` | `text-zinc-400` |

Headers show:
- Chevron icon (rotated when collapsed)
- Section name in `text-xs font-semibold uppercase tracking-wide`
- Section total in the period columns (sum of all items in that section)
- "(no items)" label when all items in the section are zero

Clicking the header row toggles visibility of child rows.

### Data Rows

- Only shown when parent section is expanded
- When "Hide empty rows" is on, rows where all period amounts are zero are hidden
- Empty cells show `—` (em dash), not `$0`
- Non-zero amounts use proper NZ formatting: `$25,000` with comma thousands separator
- Negative amounts in `text-rose-600 font-medium`
- Positive inflows in `text-emerald-600 font-medium`
- Line status shown as inline badge next to the item name: confirmed (emerald), speculative (rose), pipeline (amber), tbc (sky)

### Summary Rows

| Row | Treatment |
|-----|-----------|
| Net Operating Cash Flow | `bg-zinc-50 font-semibold`, top border |
| **Closing Balance** | `bg-zinc-900 text-white font-semibold` — dark bar, negative values in `text-rose-300` |
| Available Cash (incl. OD) | `text-emerald-600` |
| OD Status | Catalyst badge pills — `bg-emerald-50 text-emerald-700 ring-emerald-600/20` for "Within OD", `bg-rose-50 text-rose-700 ring-rose-600/20` for "OVERDRAWN" |

### Footer Bar

Light grey footer: `px-6 py-3 border-t border-zinc-100 bg-zinc-50/50`
- Left: "N empty rows hidden — Show all rows" link
- Right: "Showing weeks 1–8 of 18"

---

## Bug Fixes

### "null." Prefix

Categories added in migration 012 (Insurance, Paul Smith Loan, People's Choice) have `section_number = NULL`. The grid renders `${sectionNumber}. ${name}` without null-checking, producing "null. Insurance".

**Fix:** When rendering category labels, skip the section number prefix if `sectionNumber` is null. Just show the category name.

### Number Formatting

The pipeline summary uses `toLocaleString()` without specifying locale, which on some systems produces `25.000` (European format) instead of `25,000`.

**Fix:** Use `toLocaleString('en-NZ')` explicitly everywhere, or use a shared `formatCurrency` utility that enforces comma-separated thousands.

---

## Pipeline Summary Redesign

Apply the same Catalyst treatment:

### Entity Sections — Collapsible

Each entity (Augusto, Cornerstore, etc.) is a collapsible group with a bold header row. Same chevron pattern as the detail grid.

### Rows per Entity

| Row | Notes |
|-----|-------|
| Confirmed + Awaiting | Green when non-zero |
| Upcoming & Speculative | Default colour |
| **Total Forecast** | `font-semibold` |
| Target | `text-zinc-500` |
| Variance | `text-rose-600` when negative, `text-emerald-600` when positive |
| P&L Forecast | `text-zinc-500 italic` |

### Formatting

- Use `toLocaleString('en-NZ')` — commas for thousands ($25,000 not 25.000)
- Empty/zero cells show `—` (em dash)
- Month headers: 3-letter uppercase (`APR`, `MAY`, `JUN`)
- TOTAL column on the right

### GROUP Total Row

Bold row at bottom summing all entities. Same 6 sub-rows but with darker background (`bg-zinc-50`).

---

## Navigation Changes

### Forecast Sidebar Item

The "Forecast" sidebar item now points to the dashboard. Add a sub-navigation (like Pipeline has):
- **Overview** → `/forecast` (dashboard — default)
- **Detail** → `/forecast/detail` (the editing grid)
- **Compare** → `/forecast/compare` (scenario comparison — existing page)

### No Changes to Pipeline Nav

Pipeline keeps its current navigation (Pipeline, Summary, Targets).

---

## Shared Utilities

### `formatCurrency(amount: number): string`

Shared formatter in `lib/utils.ts`:
- Uses `en-NZ` locale
- Comma thousands separator
- No decimal places for whole numbers
- Negative amounts: `-$25,000` (minus before dollar sign)
- Zero returns `''` (empty string — let the caller decide to show dash)

### `formatCurrencyCompact(amount: number): string`

For the dashboard summary table:
- Under 1000: exact number
- 1K–999K: `${n}K` (e.g., `596K`)
- 1M+: `${n.toFixed(1)}M` (e.g., `1.2M`)

---

## Not In Scope

- Chart library selection (use simple CSS bars initially, swap to Recharts/Chart.js later if needed)
- Mobile responsive layout (desktop-first for now)
- Dark mode toggle (fixed light theme)
- Print/export styling
- Real-time updates / websockets

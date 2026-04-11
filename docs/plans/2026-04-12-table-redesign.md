# Cash Flow Table Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the forecast view into a dashboard (management) and detail grid (accounting), redesign both with Catalyst styling, and fix formatting bugs.

**Architecture:** The current `/forecast` page becomes the dashboard with summary cards, a closing balance chart, and a condensed weekly table. The current forecast grid moves to `/forecast/detail` with collapsible colour-coded sections, hide-empty-rows toggle, and status badges. The pipeline summary gets matching Catalyst treatment with proper NZ formatting.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, Vitest

**Design Spec:** `docs/specs/2026-04-12-table-redesign-design.md`

---

## File Structure

```
# New files
app/(app)/forecast/detail/page.tsx              # Detail grid page (moved from current /forecast)
components/forecast/dashboard.tsx                # Dashboard component with cards + chart + table
components/forecast/closing-balance-chart.tsx    # CSS bar chart for closing balance trend
components/forecast/condensed-table.tsx          # 5-row weekly summary table for dashboard

# Modified files
lib/utils.ts                                    # Add formatCurrencyCompact utility
components/ui/sidebar.tsx                       # Add forecast sub-navigation
app/(app)/forecast/page.tsx                     # Rewrite as dashboard (currently the grid)
components/forecast/forecast-grid.tsx            # Collapsible sections, hide empty, colour-coded
components/forecast/forecast-row.tsx             # Status badge inline, depth styling updates
components/forecast/summary-cards.tsx            # Update to shared-border Catalyst layout
components/pipeline/summary-table.tsx            # Catalyst restyling, proper formatting

# Test files
tests/unit/format-currency.test.ts              # Tests for formatCurrencyCompact
```

---

### Task 1: Fix "null." Prefix Bug + Add formatCurrencyCompact

**Files:**
- Modify: `components/forecast/forecast-grid.tsx` (lines 155, 166)
- Modify: `lib/utils.ts`
- Create: `tests/unit/format-currency.test.ts`

- [ ] **Step 1: Write tests for formatCurrencyCompact**

```typescript
// tests/unit/format-currency.test.ts
import { describe, it, expect } from 'vitest'
import { formatCurrencyCompact } from '@/lib/utils'

describe('formatCurrencyCompact', () => {
  it('returns empty string for zero', () => {
    expect(formatCurrencyCompact(0)).toBe('')
  })

  it('formats small amounts as exact numbers', () => {
    expect(formatCurrencyCompact(500)).toBe('$500')
    expect(formatCurrencyCompact(999)).toBe('$999')
  })

  it('formats thousands with K suffix', () => {
    expect(formatCurrencyCompact(1000)).toBe('$1K')
    expect(formatCurrencyCompact(25000)).toBe('$25K')
    expect(formatCurrencyCompact(596208)).toBe('$596K')
    expect(formatCurrencyCompact(999999)).toBe('$1,000K')
  })

  it('formats millions with M suffix', () => {
    expect(formatCurrencyCompact(1000000)).toBe('$1.0M')
    expect(formatCurrencyCompact(1200000)).toBe('$1.2M')
    expect(formatCurrencyCompact(5500000)).toBe('$5.5M')
  })

  it('handles negative amounts', () => {
    expect(formatCurrencyCompact(-303792)).toBe('-$304K')
    expect(formatCurrencyCompact(-511097)).toBe('-$511K')
    expect(formatCurrencyCompact(-1500000)).toBe('-$1.5M')
    expect(formatCurrencyCompact(-500)).toBe('-$500')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/format-currency.test.ts`
Expected: FAIL — `formatCurrencyCompact` not found

- [ ] **Step 3: Add formatCurrencyCompact to lib/utils.ts**

Add after the existing `formatCurrency` function:

```typescript
/**
 * Compact currency format for dashboard display.
 * 0 → '', 500 → '$500', 25000 → '$25K', 1200000 → '$1.2M'
 */
export function formatCurrencyCompact(amount: number): string {
  if (amount === 0) return ''
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    const k = Math.round(abs / 1_000)
    return `${sign}$${k.toLocaleString('en-NZ')}K`
  }
  return `${sign}$${abs}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/format-currency.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Fix the "null." prefix bug**

In `components/forecast/forecast-grid.tsx`, find line 155 where section labels are built. Change:

```typescript
// Before (line ~155):
label={`${section.sectionNumber}. ${section.name}`}
// After:
label={section.sectionNumber ? `${section.sectionNumber}. ${section.name}` : section.name}
```

Apply the same fix at line ~166 for subsections:

```typescript
// Before:
label={`${sub.sectionNumber}. ${sub.name}`}
// After:
label={sub.sectionNumber ? `${sub.sectionNumber}. ${sub.name}` : sub.name}
```

- [ ] **Step 6: Verify existing tests still pass**

Run: `cd clients/augusto-cashflow && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/utils.ts tests/unit/format-currency.test.ts components/forecast/forecast-grid.tsx
git commit -m "fix: null prefix bug + add formatCurrencyCompact utility"
```

---

### Task 2: Sidebar — Add Forecast Sub-Navigation

**Files:**
- Modify: `components/ui/sidebar.tsx`

- [ ] **Step 1: Read the current sidebar**

Read `components/ui/sidebar.tsx` to see the current nav structure. It currently has `topNavItems` (Forecast, Documents) and a Pipeline section with sub-items.

- [ ] **Step 2: Add forecast sub-navigation**

Modify the sidebar to give Forecast the same sub-item treatment as Pipeline. When the user is on any `/forecast/*` route, show sub-items:

- **Overview** → `/forecast` (the new dashboard)
- **Detail** → `/forecast/detail` (the editing grid)
- **Compare** → `/forecast/compare` (existing scenario comparison)

Follow the exact pattern used for Pipeline sub-items. The Forecast parent link should use `pathname.startsWith('/forecast')` for active state. Sub-items should use exact `pathname ===` matching, except Overview which should match exactly `/forecast`.

- [ ] **Step 3: Verify in browser**

Run the dev server and check the sidebar shows Forecast with 3 sub-items when on any forecast page.

- [ ] **Step 4: Commit**

```bash
git add components/ui/sidebar.tsx
git commit -m "feat(ui): add forecast sub-navigation (overview, detail, compare)"
```

---

### Task 3: Dashboard — Condensed Weekly Table Component

**Files:**
- Create: `components/forecast/condensed-table.tsx`

- [ ] **Step 1: Create the condensed table component**

```tsx
// components/forecast/condensed-table.tsx
'use client'

import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import type { WeekSummary } from '@/lib/types'

interface CondensedTableProps {
  summaries: WeekSummary[]
  maxWeeks?: number
}

export function CondensedTable({ summaries, maxWeeks = 8 }: CondensedTableProps) {
  const visible = summaries.slice(0, maxWeeks)

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-900">Weekly Cash Flow</h3>
        <a href="/forecast/detail" className="text-sm text-blue-600 font-medium hover:text-blue-500">
          Full Detail &rarr;
        </a>
      </div>
      <table className="min-w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-zinc-950/5">
            <th className="py-2 pr-3 text-left text-xs font-medium text-zinc-500 w-36"></th>
            {visible.map((s) => (
              <th key={s.periodId} className="py-2 px-2 text-right text-xs font-medium text-zinc-400">
                {formatDate(s.weekEnding)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-950/5">
            <td className="py-2 pr-3 text-zinc-600">Inflows</td>
            {visible.map((s) => (
              <td key={s.periodId} className={cn('py-2 px-2 text-right', s.totalInflows !== 0 ? 'text-emerald-600 font-medium' : 'text-zinc-300')}>
                {s.totalInflows !== 0 ? formatCurrency(s.totalInflows) : '—'}
              </td>
            ))}
          </tr>
          <tr className="border-b border-zinc-950/5">
            <td className="py-2 pr-3 text-zinc-600">Outflows</td>
            {visible.map((s) => (
              <td key={s.periodId} className={cn('py-2 px-2 text-right', s.totalOutflows !== 0 ? 'text-rose-600 font-medium' : 'text-zinc-300')}>
                {s.totalOutflows !== 0 ? formatCurrency(s.totalOutflows) : '—'}
              </td>
            ))}
          </tr>
          <tr className="border-b border-zinc-950/5">
            <td className="py-2 pr-3 text-zinc-600">Loans & Financing</td>
            {visible.map((s) => (
              <td key={s.periodId} className={cn('py-2 px-2 text-right', s.loansAndFinancing !== 0 ? 'text-zinc-900 font-medium' : 'text-zinc-300')}>
                {s.loansAndFinancing !== 0 ? formatCurrency(s.loansAndFinancing) : '—'}
              </td>
            ))}
          </tr>
          <tr className="bg-zinc-900 text-white font-semibold">
            <td className="py-2.5 pr-3 pl-2.5 rounded-l-lg">Closing Balance</td>
            {visible.map((s, i) => (
              <td key={s.periodId} className={cn('py-2.5 px-2 text-right', s.closingBalance < 0 ? 'text-rose-300' : 'text-white', i === visible.length - 1 && 'rounded-r-lg')}>
                {formatCurrency(s.closingBalance)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 pr-3 text-zinc-600">Available (OD)</td>
            {visible.map((s) => (
              <td key={s.periodId} className="py-2 px-2 text-right text-emerald-600">
                {formatCurrency(s.availableCash)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/forecast/condensed-table.tsx
git commit -m "feat(dashboard): condensed weekly table component"
```

---

### Task 4: Dashboard — Closing Balance Chart Component

**Files:**
- Create: `components/forecast/closing-balance-chart.tsx`

- [ ] **Step 1: Create the chart component**

A CSS-only bar chart showing closing balance per week. No chart library.

```tsx
// components/forecast/closing-balance-chart.tsx
'use client'

import { cn } from '@/lib/utils'
import type { WeekSummary } from '@/lib/types'

interface ClosingBalanceChartProps {
  summaries: WeekSummary[]
}

export function ClosingBalanceChart({ summaries }: ClosingBalanceChartProps) {
  if (summaries.length === 0) return null

  // Find range for scaling
  const values = summaries.map((s) => s.closingBalance)
  const maxAbs = Math.max(...values.map(Math.abs), 1)

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">Closing Balance Trend</h3>
      <div className="h-32 bg-zinc-50 rounded-lg flex items-end px-2 gap-0.5 pb-1">
        {summaries.map((s, i) => {
          const heightPct = Math.max((Math.abs(s.closingBalance) / maxAbs) * 100, 2)
          const isNegative = s.closingBalance < 0
          // Fade bars that are further in the future
          const opacity = i < 6 ? 1 : Math.max(0.15, 1 - (i - 5) * 0.12)
          return (
            <div
              key={s.periodId}
              className={cn(
                'flex-1 rounded-t transition-all',
                isNegative
                  ? 'bg-gradient-to-t from-blue-600 to-blue-400'
                  : 'bg-gradient-to-t from-emerald-600 to-emerald-400',
              )}
              style={{ height: `${heightPct}%`, opacity }}
              title={`${formatDate(s.weekEnding)}: ${new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(s.closingBalance)}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-zinc-400 mt-1 px-1">
        {summaries.length > 0 && <span>{formatDate(summaries[0].weekEnding)}</span>}
        {summaries.length > 6 && <span>{formatDate(summaries[Math.floor(summaries.length / 3)].weekEnding)}</span>}
        {summaries.length > 12 && <span>{formatDate(summaries[Math.floor(summaries.length * 2 / 3)].weekEnding)}</span>}
        {summaries.length > 1 && <span>{formatDate(summaries[summaries.length - 1].weekEnding)}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/forecast/closing-balance-chart.tsx
git commit -m "feat(dashboard): closing balance bar chart component"
```

---

### Task 5: Dashboard — Rewrite Summary Cards (Catalyst Shared Borders)

**Files:**
- Modify: `components/forecast/summary-cards.tsx`

- [ ] **Step 1: Read current summary-cards.tsx**

Read the file to understand the current props and data flow.

- [ ] **Step 2: Rewrite to Catalyst shared-border layout**

Replace the current implementation with the Style E layout from the spec. The component should render a single card with `grid-cols-4 divide-x divide-zinc-100 border-b border-zinc-100` stats row.

Keep the same props interface. Render 4 cells:

1. **Cash Position** — `currentWeek.closingBalance`, red if negative, shows week ending date
2. **Available Cash** — `currentWeek.availableCash`, green, progress bar showing OD utilisation %, formatted facility limit
3. **Weeks to Breach** — `weeksUntilBreach`, green "None" or red number
4. **Pipeline — [Month]** — `pipelineTotal`, amber, progress bar showing % of target (use a reasonable default target or accept as prop)

Use `formatCurrency` for exact numbers, `formatCurrencyCompact` for the pipeline display. Each cell: `px-5 py-5`, label `text-xs font-medium text-zinc-500`, value `text-2xl font-bold tabular-nums`.

The overall container should NOT have its own card border — it will be the top section of the dashboard card.

- [ ] **Step 3: Commit**

```bash
git add components/forecast/summary-cards.tsx
git commit -m "feat(dashboard): rewrite summary cards to Catalyst shared-border layout"
```

---

### Task 6: Dashboard — Main Dashboard Component + Page Rewrite

**Files:**
- Create: `components/forecast/dashboard.tsx`
- Modify: `app/(app)/forecast/page.tsx`

- [ ] **Step 1: Create the dashboard component**

```tsx
// components/forecast/dashboard.tsx
'use client'

import type { WeekSummary } from '@/lib/types'
import type { PipelineClient } from '@/lib/pipeline/types'
import { SummaryCards } from './summary-cards'
import { ClosingBalanceChart } from './closing-balance-chart'
import { CondensedTable } from './condensed-table'

interface DashboardProps {
  summaries: WeekSummary[]
  currentWeek: WeekSummary | null
  weeksUntilBreach: number | null
  pipelineTotal: number
  pipelineWeighted: number
  odFacilityLimit: number
  pipelineByStage?: {
    confirmed: number
    awaiting: number
    upcoming: number
    speculative: number
  }
}

export function Dashboard({
  summaries,
  currentWeek,
  weeksUntilBreach,
  pipelineTotal,
  pipelineWeighted,
  odFacilityLimit,
  pipelineByStage,
}: DashboardProps) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Section 1: Stats row */}
      <div className="border-b border-zinc-100">
        <SummaryCards
          currentWeek={currentWeek}
          weeksUntilBreach={weeksUntilBreach}
          pipelineTotal={pipelineTotal}
          pipelineWeighted={pipelineWeighted}
          odFacilityLimit={odFacilityLimit}
        />
      </div>

      {/* Section 2: Chart + Pipeline breakdown */}
      <div className="grid grid-cols-3 divide-x divide-zinc-100 border-b border-zinc-100">
        <div className="col-span-2 px-6 py-5">
          <ClosingBalanceChart summaries={summaries} />
        </div>
        <div className="px-5 py-5">
          <PipelineBreakdown stages={pipelineByStage} />
        </div>
      </div>

      {/* Section 3: Condensed table */}
      <div className="px-6 py-4">
        <CondensedTable summaries={summaries} />
      </div>
    </div>
  )
}

function PipelineBreakdown({ stages }: { stages?: { confirmed: number; awaiting: number; upcoming: number; speculative: number } }) {
  if (!stages) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 mb-3">Pipeline by Stage</h3>
        <p className="text-xs text-zinc-400">No pipeline data</p>
      </div>
    )
  }

  const maxVal = Math.max(stages.confirmed, stages.awaiting, stages.upcoming, stages.speculative, 1)

  const bars = [
    { label: 'Confirmed', value: stages.confirmed, color: 'bg-emerald-500' },
    { label: 'Awaiting', value: stages.awaiting, color: 'bg-amber-500' },
    { label: 'Upcoming', value: stages.upcoming, color: 'bg-sky-500' },
    { label: 'Speculative', value: stages.speculative, color: 'bg-rose-400' },
  ]

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">Pipeline by Stage</h3>
      <div className="space-y-3">
        {bars.map(({ label, value, color }) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-500">{label}</span>
              <span className="font-medium text-zinc-900">
                {value > 0 ? `$${Math.round(value / 1000)}K` : '—'}
              </span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full">
              <div
                className={`h-2 ${color} rounded-full`}
                style={{ width: value > 0 ? `${Math.max((value / maxVal) * 100, 2)}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite forecast page as dashboard**

Read the current `app/(app)/forecast/page.tsx`. It currently renders SummaryCards + Tabs + ScenarioToolbar + ForecastGrid. Rewrite it to render the Dashboard component instead.

Keep all the existing data fetching (loadForecastData, computeWeekSummaries, generateRecurringLines). Remove the grid rendering. Add pipeline stage aggregation:

```typescript
// Compute pipeline by stage for the dashboard
const pipelineByStage = {
  confirmed: 0,
  awaiting: 0,
  upcoming: 0,
  speculative: 0,
}
for (const line of allLines) {
  if (line.source !== 'pipeline') continue
  const stage = line.lineStatus
  if (stage === 'confirmed') pipelineByStage.confirmed += line.amount
  else if (stage === 'awaiting_budget_approval') pipelineByStage.awaiting += line.amount
  else if (stage === 'tbc') pipelineByStage.upcoming += line.amount
  else if (stage === 'speculative') pipelineByStage.speculative += line.amount
}
```

Render the Dashboard component with all props.

- [ ] **Step 3: Verify in browser**

Navigate to `/forecast`. Should show the dashboard with summary cards, chart, pipeline breakdown, and condensed table.

- [ ] **Step 4: Commit**

```bash
git add components/forecast/dashboard.tsx app/\(app\)/forecast/page.tsx
git commit -m "feat(dashboard): rewrite forecast page as dashboard overview"
```

---

### Task 7: Move Detail Grid to /forecast/detail

**Files:**
- Create: `app/(app)/forecast/detail/page.tsx`

- [ ] **Step 1: Create the detail page**

This is the old forecast page content — server component that loads forecast data and renders the ForecastGrid. Copy the data fetching from the old `forecast/page.tsx` (before the dashboard rewrite) and render ForecastGrid + ScenarioToolbar.

```tsx
// app/(app)/forecast/detail/page.tsx
import { createClient } from '@/lib/supabase/server'
import { loadForecastData } from '@/lib/forecast/queries'
import { generateRecurringLines } from '@/lib/forecast/recurring'
import { computeWeekSummaries } from '@/lib/forecast/engine'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { ForecastGrid } from '@/components/forecast/forecast-grid'
import { ScenarioToolbar } from '@/components/forecast/scenario-toolbar'

export default async function ForecastDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string; weighted?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const weighted = params.weighted !== 'false'

  const data = await loadForecastData(supabase, AUGUSTO_GROUP_ID)
  const recurringLines = generateRecurringLines(data.rules, data.periods)
  const allLines = [...data.lines, ...recurringLines]

  const summaries = computeWeekSummaries(
    data.periods,
    allLines,
    data.categories,
    data.entityGroup?.odFacilityLimit ?? 0,
    weighted,
  )

  // Load scenarios for the toolbar
  const { data: scenarios } = await supabase
    .from('scenarios')
    .select('id, name, is_default')
    .order('name')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Cash Flow Detail</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Augusto Group — 18-week rolling forecast</p>
        </div>
        <ScenarioToolbar scenarios={scenarios ?? []} />
      </div>
      <ForecastGrid
        periods={data.periods}
        categories={data.categories}
        lines={allLines}
        summaries={summaries}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/forecast/detail`. Should show the full editing grid (same as old `/forecast`).

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/forecast/detail/page.tsx
git commit -m "feat: move forecast detail grid to /forecast/detail"
```

---

### Task 8: Redesign Forecast Grid — Collapsible Sections + Hide Empty Rows

**Files:**
- Modify: `components/forecast/forecast-grid.tsx`

- [ ] **Step 1: Read the current forecast-grid.tsx**

Read the full file to understand the SectionBlock function and row rendering.

- [ ] **Step 2: Add hide-empty-rows toggle and page header controls**

Add a controls bar at the top of the grid with:
- "Hide empty rows" checkbox (default: checked) — controls a `hideEmpty` state
- The existing weighted toggle and scenario dropdown should remain on the page (they're in ScenarioToolbar, rendered by the parent page)

Add a `useState` hook for `hideEmpty` (default `true`) and a `Map<string, boolean>` for section collapsed state.

- [ ] **Step 3: Add colour-coded collapsible section headers**

Modify the `SectionBlock` function:

1. Add a section header row with colour-coded background based on the section's `flowDirection`:
   - `inflow` → `bg-emerald-50/50` with `text-emerald-700` and emerald chevron
   - `outflow` → `bg-rose-50/40` with `text-rose-700` and rose chevron
   - `balance` / `computed` → `bg-zinc-50/80` with `text-zinc-700` and zinc chevron

2. The header shows:
   - Chevron SVG (rotated -90deg when collapsed)
   - Section name in `text-xs font-semibold uppercase tracking-wide`
   - If all items in the section are zero across all periods, show "(no items)" label
   - Section total amounts in the period columns

3. Clicking the header toggles child row visibility
4. Sections with no data auto-collapse on initial render

- [ ] **Step 4: Hide empty rows when toggle is on**

When `hideEmpty` is true, skip rendering any data row where ALL period amounts are zero. Count the hidden rows.

- [ ] **Step 5: Add footer bar**

After the table, add a footer:
```tsx
<div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
  <p className="text-[11px] text-zinc-400">
    {hiddenCount} empty rows hidden —{' '}
    <button onClick={() => setHideEmpty(false)} className="text-blue-600 hover:underline">Show all rows</button>
  </p>
  <p className="text-[11px] text-zinc-400">
    Showing weeks 1–{Math.min(periods.length, 18)} of {periods.length}
  </p>
</div>
```

- [ ] **Step 6: Update OD Status cells**

Replace the plain "Within OD" / "OVERDRAWN" text with Catalyst badge pills:
- Within OD: `bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 rounded-full px-2 py-0.5 text-[10px] font-medium`
- OVERDRAWN: `bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 rounded-full px-2 py-0.5 text-[10px] font-medium`

- [ ] **Step 7: Verify in browser**

Navigate to `/forecast/detail`. Verify:
- Colour-coded section headers
- Sections collapse/expand on click
- Empty sections auto-collapsed
- "Hide empty rows" toggle works
- Footer shows hidden row count
- OD Status uses badge pills
- "null." prefix is gone

- [ ] **Step 8: Commit**

```bash
git add components/forecast/forecast-grid.tsx
git commit -m "feat(grid): collapsible colour-coded sections, hide-empty-rows toggle, OD badges"
```

---

### Task 9: Add Line Status Badges to Forecast Rows

**Files:**
- Modify: `components/forecast/forecast-row.tsx`

- [ ] **Step 1: Read current forecast-row.tsx**

Read the file to understand where the label and source indicator are rendered.

- [ ] **Step 2: Add inline status badge**

For data rows (depth 2), show the `lineStatus` as an inline Catalyst badge next to the label. Use the same badge styling from the pipeline module:

```tsx
const statusBadgeConfig: Record<string, { label: string; classes: string }> = {
  confirmed: { label: 'confirmed', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  speculative: { label: 'speculative', classes: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  tbc: { label: 'tbc', classes: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  awaiting_budget_approval: { label: 'awaiting', classes: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  awaiting_payment: { label: 'awaiting payment', classes: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
  paid: { label: 'paid', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
}
```

Only show the badge when `lineStatus` is not `'none'` and not null. Render it as:
```tsx
<span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ml-2', config.classes)}>
  {config.label}
</span>
```

- [ ] **Step 3: Verify in browser**

Check `/forecast/detail` — lines with status badges should show them inline.

- [ ] **Step 4: Commit**

```bash
git add components/forecast/forecast-row.tsx
git commit -m "feat(grid): inline line status badges on forecast rows"
```

---

### Task 10: Pipeline Summary — Catalyst Restyling

**Files:**
- Modify: `components/pipeline/summary-table.tsx`

- [ ] **Step 1: Read current summary-table.tsx**

Read the file to understand the current structure and rendering.

- [ ] **Step 2: Apply Catalyst styling**

Restyle the pipeline summary table to match the design spec:

1. **Wrap in a white card**: `bg-white rounded-xl border border-zinc-200 overflow-hidden`
2. **Entity sections collapsible**: Add chevron + collapsed state (same pattern as forecast grid sections). Bold entity name as header row.
3. **Proper NZ formatting**: Verify the existing `fmt()` function uses `'en-NZ'` locale (it should already based on exploration). If not, fix it.
4. **Empty cells**: Verify dashes for zero (should already work). 
5. **Variance colour**: `text-rose-600` when negative, `text-emerald-600` when positive (verify existing).
6. **Table headers**: `text-xs font-medium text-zinc-400 uppercase` matching Catalyst style.
7. **GROUP total section**: `bg-zinc-50` background for the summary row group.

- [ ] **Step 3: Verify in browser**

Navigate to `/pipeline/summary`. Verify:
- Entity sections have chevron and collapse
- Numbers formatted with commas (not periods)
- Variance is colour-coded
- Clean Catalyst table styling

- [ ] **Step 4: Commit**

```bash
git add components/pipeline/summary-table.tsx
git commit -m "feat(pipeline): Catalyst restyling for summary table"
```

---

### Task 11: Integration Verification

- [ ] **Step 1: Run all tests**

Run: `cd clients/augusto-cashflow && npx vitest run`
Expected: All tests pass (including new formatCurrencyCompact tests).

- [ ] **Step 2: Run typecheck**

Run: `cd clients/augusto-cashflow && npx tsc --noEmit`
Expected: No new type errors (pre-existing ones are acceptable).

- [ ] **Step 3: Full browser walkthrough**

With dev server running:

1. Navigate to `/forecast` — dashboard loads with summary cards, chart, pipeline breakdown, condensed table
2. Click "Full Detail" → navigates to `/forecast/detail` — shows redesigned grid
3. Verify grid sections are colour-coded and collapsible
4. Toggle "Hide empty rows" — rows appear/disappear, footer updates count
5. Verify "null." prefix is gone on Insurance, Paul Smith Loan, People's Choice
6. Verify status badges appear on lines with non-"none" status
7. Check OD Status shows as green badge pills
8. Navigate to `/forecast/compare` — existing scenario comparison still works
9. Navigate to `/pipeline/summary` — Catalyst-styled, collapsible, proper formatting
10. Check sidebar — Forecast section shows Overview/Detail/Compare sub-items

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): table redesign integration verification — all tests pass"
```

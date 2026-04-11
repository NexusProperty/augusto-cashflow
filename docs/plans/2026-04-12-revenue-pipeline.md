# Revenue Pipeline Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a revenue pipeline module that replaces the Agency Revenue Tracker Excel, letting the client service team manage project-level revenue forecasts per BU per month, with auto-sync into the weekly cash flow forecast.

**Architecture:** Four new database tables (pipeline_clients, pipeline_projects, pipeline_allocations, revenue_targets) plus one new column on forecast_lines. A sync engine converts monthly pipeline allocations into weekly forecast_lines with configurable distribution. Three new pages (/pipeline, /pipeline/summary, /pipeline/targets) with inline editing and BU-grouped views.

**Tech Stack:** Next.js 15, React 19, Supabase (Postgres + RLS), Tailwind CSS v4, Vitest, exceljs (for import)

**Design Spec:** `docs/specs/2026-04-12-revenue-pipeline-design.md`

---

## File Structure

```
# New files
supabase/migrations/016_pipeline_tables.sql        # 4 new tables + 1 ALTER
supabase/migrations/017_pipeline_seed.sql           # Seed FY2027 targets from Excel

lib/pipeline/types.ts                               # Pipeline domain types
lib/pipeline/queries.ts                             # Data fetching for pipeline pages
lib/pipeline/sync-engine.ts                         # Pipeline → forecast_lines sync
lib/pipeline/fiscal-year.ts                         # Fiscal year utilities
lib/pipeline/summary.ts                             # BU summary computation

app/(app)/pipeline/page.tsx                         # Main pipeline grid page
app/(app)/pipeline/actions.ts                       # Server actions (CRUD + sync)
app/(app)/pipeline/summary/page.tsx                 # BU summary page
app/(app)/pipeline/targets/page.tsx                 # Target management page

components/pipeline/pipeline-grid.tsx               # Main monthly grid with inline editing
components/pipeline/project-drawer.tsx              # Slide-over for add/edit project
components/pipeline/stage-badge.tsx                 # Colored pipeline stage pill
components/pipeline/summary-table.tsx               # BU summary roll-up table
components/pipeline/target-grid.tsx                 # Editable target grid
components/pipeline/sync-status.tsx                 # Sync indicator per project
components/pipeline/fiscal-year-nav.tsx             # FY selector with arrows

lib/pipeline/excel-import.ts                        # Excel parser for revenue tracker
app/(app)/pipeline/import/page.tsx                  # Import review UI

# Modified files
lib/types.ts                                        # Add pipeline types + stage enum
components/ui/sidebar.tsx                           # Add Pipeline nav section
components/forecast/forecast-grid.tsx               # Pipeline badge on synced lines

# Test files
tests/unit/pipeline-sync-engine.test.ts             # Sync engine logic
tests/unit/pipeline-summary.test.ts                 # Summary computation
tests/unit/pipeline-fiscal-year.test.ts             # Fiscal year utils
tests/unit/pipeline-excel-import.test.ts            # Excel parser
```

---

### Task 1: Database Migration — Pipeline Tables

**Files:**
- Create: `supabase/migrations/016_pipeline_tables.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 016_pipeline_tables.sql
-- Revenue pipeline module: clients, projects, allocations, targets

-- Pipeline clients (end-clients/brands per entity)
create table pipeline_clients (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, name)
);

create index idx_pipeline_clients_entity on pipeline_clients(entity_id);

-- Pipeline projects (individual jobs per client)
create table pipeline_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references pipeline_clients(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  job_number text,
  project_name text not null,
  task_estimate text,
  stage text not null default 'speculative'
    check (stage in ('confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined')),
  team_member text,
  billing_amount numeric,
  third_party_costs numeric,
  gross_profit numeric,
  invoice_date text,
  notes text,
  is_synced boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pipeline_projects_client on pipeline_projects(client_id);
create index idx_pipeline_projects_entity on pipeline_projects(entity_id);
create index idx_pipeline_projects_stage on pipeline_projects(stage);

-- Pipeline allocations (monthly revenue per project)
create table pipeline_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pipeline_projects(id) on delete cascade,
  month date not null,
  amount numeric not null default 0,
  distribution text not null default 'even'
    check (distribution in ('even', 'first_week', 'last_week', 'custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, month)
);

create index idx_pipeline_allocations_project on pipeline_allocations(project_id);
create index idx_pipeline_allocations_month on pipeline_allocations(month);

-- Revenue targets (monthly per entity)
create table revenue_targets (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  month date not null,
  target_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, month)
);

create index idx_revenue_targets_entity on revenue_targets(entity_id);
create index idx_revenue_targets_month on revenue_targets(month);

-- Add pipeline FK to forecast_lines
alter table forecast_lines
  add column if not exists source_pipeline_project_id uuid
    references pipeline_projects(id) on delete set null;

create index idx_forecast_lines_pipeline_project
  on forecast_lines(source_pipeline_project_id)
  where source_pipeline_project_id is not null;

-- RLS policies
alter table pipeline_clients enable row level security;
create policy "authenticated_full_access" on pipeline_clients
  for all to authenticated using (true) with check (true);

alter table pipeline_projects enable row level security;
create policy "authenticated_full_access" on pipeline_projects
  for all to authenticated using (true) with check (true);

alter table pipeline_allocations enable row level security;
create policy "authenticated_full_access" on pipeline_allocations
  for all to authenticated using (true) with check (true);

alter table revenue_targets enable row level security;
create policy "authenticated_full_access" on revenue_targets
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd clients/augusto-cashflow && npx supabase db reset`
Expected: All 16 migrations apply successfully, including the new 016.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --local > lib/database.types.ts`
Expected: `lib/database.types.ts` now includes pipeline_clients, pipeline_projects, pipeline_allocations, revenue_targets tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/016_pipeline_tables.sql lib/database.types.ts
git commit -m "feat(pipeline): add pipeline tables migration (016)"
```

---

### Task 2: Pipeline Domain Types

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/pipeline/types.ts`

- [ ] **Step 1: Add pipeline stage enum to lib/types.ts**

Add after the existing `LineStatus` type:

```typescript
export type PipelineStage = 'confirmed' | 'awaiting_approval' | 'upcoming' | 'speculative' | 'declined'
```

- [ ] **Step 2: Create lib/pipeline/types.ts**

```typescript
import type { PipelineStage } from '@/lib/types'

export interface PipelineClient {
  id: string
  entityId: string
  name: string
  isActive: boolean
  notes: string | null
}

export interface PipelineProject {
  id: string
  clientId: string
  entityId: string
  jobNumber: string | null
  projectName: string
  taskEstimate: string | null
  stage: PipelineStage
  teamMember: string | null
  billingAmount: number | null
  thirdPartyCosts: number | null
  grossProfit: number | null
  invoiceDate: string | null
  notes: string | null
  isSynced: boolean
  createdBy: string | null
}

export interface PipelineAllocation {
  id: string
  projectId: string
  month: string // ISO date string, first of month
  amount: number
  distribution: DistributionRule
}

export type DistributionRule = 'even' | 'first_week' | 'last_week' | 'custom'

export interface RevenueTarget {
  id: string
  entityId: string
  month: string
  targetAmount: number
}

/** Stage → confidence mapping for forecast sync */
export const STAGE_CONFIDENCE: Record<PipelineStage, number> = {
  confirmed: 100,
  awaiting_approval: 80,
  upcoming: 50,
  speculative: 20,
  declined: 0,
}

/** Stage → forecast line_status mapping */
export const STAGE_LINE_STATUS: Record<PipelineStage, string> = {
  confirmed: 'confirmed',
  awaiting_approval: 'awaiting_budget_approval',
  upcoming: 'tbc',
  speculative: 'speculative',
  declined: 'none',
}

/** Stage display config */
export const STAGE_DISPLAY: Record<PipelineStage, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: 'emerald' },
  awaiting_approval: { label: 'Awaiting Approval', color: 'amber' },
  upcoming: { label: 'Upcoming', color: 'sky' },
  speculative: { label: 'Speculative', color: 'rose' },
  declined: { label: 'Declined', color: 'zinc' },
}

/** P&L forecast weighting (separate from sync confidence) */
export const PNL_WEIGHT: Record<PipelineStage, number> = {
  confirmed: 1.0,
  awaiting_approval: 0.5,
  upcoming: 0.5,
  speculative: 0.5,
  declined: 0,
}

/** Row from DB mapped to app shape, including client name for display */
export interface PipelineProjectRow extends PipelineProject {
  clientName: string
  allocations: PipelineAllocation[]
  totalAmount: number
}

/** BU summary row for the summary page */
export interface BUSummaryRow {
  entityId: string
  entityName: string
  confirmedAndAwaiting: number[]   // 12 months
  upcomingAndSpeculative: number[] // 12 months
  totalForecast: number[]          // 12 months
  target: number[]                 // 12 months
  variance: number[]               // 12 months
  pnlForecast: number[]            // 12 months
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts lib/pipeline/types.ts
git commit -m "feat(pipeline): add pipeline domain types"
```

---

### Task 3: Fiscal Year Utilities

**Files:**
- Create: `lib/pipeline/fiscal-year.ts`
- Create: `tests/unit/pipeline-fiscal-year.test.ts`

- [ ] **Step 1: Write tests for fiscal year utilities**

```typescript
// tests/unit/pipeline-fiscal-year.test.ts
import { describe, it, expect } from 'vitest'
import {
  getFiscalYear,
  getFiscalYearMonths,
  getMonthsInRange,
  getWeeksInMonth,
} from '@/lib/pipeline/fiscal-year'

describe('getFiscalYear', () => {
  it('returns FY2027 for dates in Apr 2026 - Mar 2027 (start=4)', () => {
    expect(getFiscalYear(new Date('2026-04-15'), 4)).toBe(2027)
    expect(getFiscalYear(new Date('2027-03-31'), 4)).toBe(2027)
  })

  it('returns FY2027 for April 1 2026 (boundary)', () => {
    expect(getFiscalYear(new Date('2026-04-01'), 4)).toBe(2027)
  })

  it('returns FY2026 for March 31 2026 (before boundary)', () => {
    expect(getFiscalYear(new Date('2026-03-31'), 4)).toBe(2026)
  })
})

describe('getFiscalYearMonths', () => {
  it('returns 12 month-start dates for FY2027 (Apr start)', () => {
    const months = getFiscalYearMonths(2027, 4)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-04-01')
    expect(months[1]).toBe('2026-05-01')
    expect(months[11]).toBe('2027-03-01')
  })
})

describe('getWeeksInMonth', () => {
  it('returns week_ending dates that fall in April 2026', () => {
    // Weeks ending on Fridays: Apr 3, 10, 17, 24 (if week_ending is Friday)
    // Actual weeks depend on the forecast_periods in DB
    // This function takes an array of all period dates and filters
    const allWeeks = [
      '2026-03-27', '2026-04-03', '2026-04-10', '2026-04-17',
      '2026-04-24', '2026-05-01', '2026-05-08',
    ]
    const result = getWeeksInMonth(allWeeks, '2026-04-01')
    expect(result).toEqual(['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24'])
  })

  it('returns empty array when no weeks fall in month', () => {
    const allWeeks = ['2026-03-27', '2026-05-01']
    const result = getWeeksInMonth(allWeeks, '2026-04-01')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-fiscal-year.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement fiscal year utilities**

```typescript
// lib/pipeline/fiscal-year.ts

/** Default fiscal year start month (April for NZ) */
export const DEFAULT_FY_START = 4

/**
 * Get the fiscal year number for a date.
 * FY2027 = Apr 2026 – Mar 2027 when fyStartMonth=4.
 */
export function getFiscalYear(date: Date, fyStartMonth = DEFAULT_FY_START): number {
  const month = date.getMonth() + 1 // 1-indexed
  const year = date.getFullYear()
  return month >= fyStartMonth ? year + 1 : year
}

/**
 * Get 12 month-start ISO date strings for a fiscal year.
 * getFiscalYearMonths(2027, 4) → ['2026-04-01', '2026-05-01', ..., '2027-03-01']
 */
export function getFiscalYearMonths(fy: number, fyStartMonth = DEFAULT_FY_START): string[] {
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const m = ((fyStartMonth - 1 + i) % 12) + 1
    const y = m >= fyStartMonth ? fy - 1 : fy
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
  }
  return months
}

/**
 * Get the short month label for a month date string.
 * '2026-04-01' → 'APR'
 */
export function getMonthLabel(monthStr: string): string {
  const labels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const m = parseInt(monthStr.slice(5, 7), 10)
  return labels[m - 1]
}

/**
 * Filter week_ending dates that fall within a given month.
 * A week belongs to whichever month contains its week_ending date.
 */
export function getWeeksInMonth(allWeekEndings: string[], monthStr: string): string[] {
  const year = parseInt(monthStr.slice(0, 4), 10)
  const month = parseInt(monthStr.slice(5, 7), 10)
  return allWeekEndings.filter((we) => {
    const weYear = parseInt(we.slice(0, 4), 10)
    const weMonth = parseInt(we.slice(5, 7), 10)
    return weYear === year && weMonth === month
  })
}

/**
 * Get the current fiscal year based on today's date.
 */
export function getCurrentFiscalYear(fyStartMonth = DEFAULT_FY_START): number {
  return getFiscalYear(new Date(), fyStartMonth)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-fiscal-year.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/fiscal-year.ts tests/unit/pipeline-fiscal-year.test.ts
git commit -m "feat(pipeline): fiscal year utilities with tests"
```

---

### Task 4: Sync Engine — Pipeline to Forecast Lines

**Files:**
- Create: `lib/pipeline/sync-engine.ts`
- Create: `tests/unit/pipeline-sync-engine.test.ts`

- [ ] **Step 1: Write tests for the sync engine**

```typescript
// tests/unit/pipeline-sync-engine.test.ts
import { describe, it, expect } from 'vitest'
import { computeSyncLines } from '@/lib/pipeline/sync-engine'
import type { PipelineAllocation } from '@/lib/pipeline/types'

const ENTITY_ID = 'e1'
const PROJECT_ID = 'p1'
const CLIENT_NAME = 'adidas'
const BANK_ACCOUNT_ID = 'ba1'
const AR_CATEGORY_ID = 'cat-ar'

describe('computeSyncLines', () => {
  const weekEndings = ['2026-04-03', '2026-04-10', '2026-04-17', '2026-04-24']
  const periodMap: Record<string, string> = {
    '2026-04-03': 'per-1',
    '2026-04-10': 'per-2',
    '2026-04-17': 'per-3',
    '2026-04-24': 'per-4',
  }

  it('distributes evenly across weeks in the month', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 100000,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'confirmed',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(4)
    expect(lines[0].amount).toBe(25000)
    expect(lines[0].confidence).toBe(100)
    expect(lines[0].lineStatus).toBe('confirmed')
    expect(lines[0].periodId).toBe('per-1')
    expect(lines[0].source).toBe('pipeline')
    expect(lines[0].counterparty).toBe('adidas')
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(100000)
  })

  it('puts full amount on first week when distribution is first_week', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 60000,
      distribution: 'first_week',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'awaiting_approval',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(60000)
    expect(lines[0].confidence).toBe(80)
    expect(lines[0].lineStatus).toBe('awaiting_budget_approval')
    expect(lines[0].periodId).toBe('per-1')
  })

  it('puts full amount on last week when distribution is last_week', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 60000,
      distribution: 'last_week',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'upcoming',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(60000)
    expect(lines[0].confidence).toBe(50)
    expect(lines[0].lineStatus).toBe('tbc')
    expect(lines[0].periodId).toBe('per-4')
  })

  it('returns empty array for declined stage', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 50000,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'declined',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    expect(lines).toHaveLength(0)
  })

  it('returns empty array when no weeks exist for the month', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 50000,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'confirmed',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings: [],
      periodMap: {},
    })

    expect(lines).toHaveLength(0)
  })

  it('handles remainder cents by adding to last week on even distribution', () => {
    const allocation: PipelineAllocation = {
      id: 'a1',
      projectId: PROJECT_ID,
      month: '2026-04-01',
      amount: 100001,
      distribution: 'even',
    }

    const lines = computeSyncLines({
      allocation,
      stage: 'confirmed',
      entityId: ENTITY_ID,
      projectId: PROJECT_ID,
      clientName: CLIENT_NAME,
      bankAccountId: BANK_ACCOUNT_ID,
      arCategoryId: AR_CATEGORY_ID,
      weekEndings,
      periodMap,
    })

    const total = lines.reduce((s, l) => s + l.amount, 0)
    expect(total).toBe(100001)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-sync-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement sync engine**

```typescript
// lib/pipeline/sync-engine.ts
import type { PipelineStage } from '@/lib/types'
import type { PipelineAllocation, DistributionRule } from './types'
import { STAGE_CONFIDENCE, STAGE_LINE_STATUS } from './types'

export interface SyncLineInput {
  allocation: PipelineAllocation
  stage: PipelineStage
  entityId: string
  projectId: string
  clientName: string
  bankAccountId: string
  arCategoryId: string
  weekEndings: string[]
  periodMap: Record<string, string> // weekEnding → periodId
}

export interface SyncedForecastLine {
  entityId: string
  categoryId: string
  periodId: string
  bankAccountId: string
  amount: number
  confidence: number
  source: 'pipeline'
  sourcePipelineProjectId: string
  counterparty: string
  lineStatus: string
}

/**
 * Compute forecast_lines from a single pipeline allocation.
 * Pure function — no DB access. Returns lines to be inserted.
 */
export function computeSyncLines(input: SyncLineInput): SyncedForecastLine[] {
  const { allocation, stage, entityId, projectId, clientName, bankAccountId, arCategoryId, weekEndings, periodMap } = input

  if (stage === 'declined') return []
  if (weekEndings.length === 0) return []

  const confidence = STAGE_CONFIDENCE[stage]
  const lineStatus = STAGE_LINE_STATUS[stage]
  const base = {
    entityId,
    categoryId: arCategoryId,
    bankAccountId,
    confidence,
    source: 'pipeline' as const,
    sourcePipelineProjectId: projectId,
    counterparty: clientName,
    lineStatus,
  }

  switch (allocation.distribution) {
    case 'first_week': {
      const periodId = periodMap[weekEndings[0]]
      if (!periodId) return []
      return [{ ...base, periodId, amount: allocation.amount }]
    }
    case 'last_week': {
      const last = weekEndings[weekEndings.length - 1]
      const periodId = periodMap[last]
      if (!periodId) return []
      return [{ ...base, periodId, amount: allocation.amount }]
    }
    case 'even':
    default: {
      const count = weekEndings.length
      const perWeek = Math.floor(allocation.amount / count)
      const remainder = allocation.amount - perWeek * count

      return weekEndings.map((we, i) => {
        const periodId = periodMap[we]
        if (!periodId) return null
        const amount = i === count - 1 ? perWeek + remainder : perWeek
        return { ...base, periodId, amount }
      }).filter((l): l is SyncedForecastLine => l !== null)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-sync-engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/sync-engine.ts tests/unit/pipeline-sync-engine.test.ts
git commit -m "feat(pipeline): sync engine with distribution logic and tests"
```

---

### Task 5: BU Summary Computation

**Files:**
- Create: `lib/pipeline/summary.ts`
- Create: `tests/unit/pipeline-summary.test.ts`

- [ ] **Step 1: Write tests for BU summary computation**

```typescript
// tests/unit/pipeline-summary.test.ts
import { describe, it, expect } from 'vitest'
import { computeBUSummary } from '@/lib/pipeline/summary'
import type { PipelineProjectRow } from '@/lib/pipeline/types'

const months = ['2026-04-01', '2026-05-01', '2026-06-01']

const makeProject = (
  entityId: string,
  stage: string,
  allocations: { month: string; amount: number }[],
): PipelineProjectRow => ({
  id: `p-${Math.random()}`,
  clientId: 'c1',
  entityId,
  jobNumber: null,
  projectName: 'Test',
  taskEstimate: null,
  stage: stage as any,
  teamMember: null,
  billingAmount: null,
  thirdPartyCosts: null,
  grossProfit: null,
  invoiceDate: null,
  notes: null,
  isSynced: true,
  createdBy: null,
  clientName: 'Test Client',
  allocations: allocations.map((a, i) => ({
    id: `a-${i}`,
    projectId: 'p1',
    month: a.month,
    amount: a.amount,
    distribution: 'even' as const,
  })),
  totalAmount: allocations.reduce((s, a) => s + a.amount, 0),
})

const entities = [
  { id: 'aug', name: 'Augusto' },
  { id: 'cnr', name: 'Cornerstore' },
]

const targets = [
  { id: 't1', entityId: 'aug', month: '2026-04-01', targetAmount: 325000 },
  { id: 't2', entityId: 'aug', month: '2026-05-01', targetAmount: 325000 },
  { id: 't3', entityId: 'aug', month: '2026-06-01', targetAmount: 325000 },
]

describe('computeBUSummary', () => {
  it('sums confirmed + awaiting_approval into confirmedAndAwaiting', () => {
    const projects = [
      makeProject('aug', 'confirmed', [{ month: '2026-04-01', amount: 50000 }]),
      makeProject('aug', 'awaiting_approval', [{ month: '2026-04-01', amount: 20000 }]),
      makeProject('aug', 'speculative', [{ month: '2026-04-01', amount: 100000 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    expect(aug.confirmedAndAwaiting[0]).toBe(70000) // 50k + 20k
    expect(aug.upcomingAndSpeculative[0]).toBe(100000)
    expect(aug.totalForecast[0]).toBe(170000)
  })

  it('computes variance as confirmed - target (negative when under)', () => {
    const projects = [
      makeProject('aug', 'confirmed', [{ month: '2026-04-01', amount: 50000 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    expect(aug.variance[0]).toBe(50000 - 325000) // -275000
  })

  it('computes P&L forecast with weighted stages', () => {
    const projects = [
      makeProject('aug', 'confirmed', [{ month: '2026-04-01', amount: 100000 }]),
      makeProject('aug', 'awaiting_approval', [{ month: '2026-04-01', amount: 60000 }]),
      makeProject('aug', 'speculative', [{ month: '2026-04-01', amount: 80000 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    // 100000*1.0 + 60000*0.5 + 80000*0.5 = 100000 + 30000 + 40000 = 170000
    expect(aug.pnlForecast[0]).toBe(170000)
  })

  it('excludes declined projects from all calculations', () => {
    const projects = [
      makeProject('aug', 'declined', [{ month: '2026-04-01', amount: 999999 }]),
    ]

    const rows = computeBUSummary(projects, entities, targets, months)
    const aug = rows.find((r) => r.entityId === 'aug')!

    expect(aug.confirmedAndAwaiting[0]).toBe(0)
    expect(aug.totalForecast[0]).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-summary.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement BU summary computation**

```typescript
// lib/pipeline/summary.ts
import type { PipelineProjectRow, BUSummaryRow, RevenueTarget } from './types'
import { PNL_WEIGHT } from './types'
import type { PipelineStage } from '@/lib/types'

interface EntityInfo {
  id: string
  name: string
}

export function computeBUSummary(
  projects: PipelineProjectRow[],
  entities: EntityInfo[],
  targets: RevenueTarget[],
  months: string[],
): BUSummaryRow[] {
  return entities.map((entity) => {
    const entityProjects = projects.filter((p) => p.entityId === entity.id && p.stage !== 'declined')

    const confirmedAndAwaiting = months.map((m) =>
      sumAllocationsForMonth(entityProjects, m, ['confirmed', 'awaiting_approval']),
    )
    const upcomingAndSpeculative = months.map((m) =>
      sumAllocationsForMonth(entityProjects, m, ['upcoming', 'speculative']),
    )
    const totalForecast = months.map((_, i) => confirmedAndAwaiting[i] + upcomingAndSpeculative[i])

    const target = months.map((m) => {
      const t = targets.find((t) => t.entityId === entity.id && t.month === m)
      return t?.targetAmount ?? 0
    })

    const variance = months.map((_, i) => confirmedAndAwaiting[i] - target[i])

    const pnlForecast = months.map((m) =>
      entityProjects.reduce((sum, proj) => {
        const alloc = proj.allocations.find((a) => a.month === m)
        if (!alloc) return sum
        const weight = PNL_WEIGHT[proj.stage as PipelineStage] ?? 0
        return sum + alloc.amount * weight
      }, 0),
    )

    return {
      entityId: entity.id,
      entityName: entity.name,
      confirmedAndAwaiting,
      upcomingAndSpeculative,
      totalForecast,
      target,
      variance,
      pnlForecast,
    }
  })
}

function sumAllocationsForMonth(
  projects: PipelineProjectRow[],
  month: string,
  stages: PipelineStage[],
): number {
  return projects
    .filter((p) => stages.includes(p.stage as PipelineStage))
    .reduce((sum, proj) => {
      const alloc = proj.allocations.find((a) => a.month === month)
      return sum + (alloc?.amount ?? 0)
    }, 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-summary.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/summary.ts tests/unit/pipeline-summary.test.ts
git commit -m "feat(pipeline): BU summary computation with tests"
```

---

### Task 6: Pipeline Data Queries

**Files:**
- Create: `lib/pipeline/queries.ts`

- [ ] **Step 1: Implement pipeline data queries**

```typescript
// lib/pipeline/queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PipelineClient,
  PipelineProject,
  PipelineAllocation,
  PipelineProjectRow,
  RevenueTarget,
} from './types'

function mapClient(row: any): PipelineClient {
  return {
    id: row.id,
    entityId: row.entity_id,
    name: row.name,
    isActive: row.is_active,
    notes: row.notes,
  }
}

function mapProject(row: any): PipelineProject {
  return {
    id: row.id,
    clientId: row.client_id,
    entityId: row.entity_id,
    jobNumber: row.job_number,
    projectName: row.project_name,
    taskEstimate: row.task_estimate,
    stage: row.stage,
    teamMember: row.team_member,
    billingAmount: row.billing_amount != null ? Number(row.billing_amount) : null,
    thirdPartyCosts: row.third_party_costs != null ? Number(row.third_party_costs) : null,
    grossProfit: row.gross_profit != null ? Number(row.gross_profit) : null,
    invoiceDate: row.invoice_date,
    notes: row.notes,
    isSynced: row.is_synced,
    createdBy: row.created_by,
  }
}

function mapAllocation(row: any): PipelineAllocation {
  return {
    id: row.id,
    projectId: row.project_id,
    month: row.month,
    amount: Number(row.amount) || 0,
    distribution: row.distribution,
  }
}

function mapTarget(row: any): RevenueTarget {
  return {
    id: row.id,
    entityId: row.entity_id,
    month: row.month,
    targetAmount: Number(row.target_amount) || 0,
  }
}

/** Load all pipeline data for a set of entities within a fiscal year's months */
export async function loadPipelineData(
  supabase: SupabaseClient,
  entityIds: string[],
  months: string[],
): Promise<{
  clients: PipelineClient[]
  projects: PipelineProjectRow[]
  targets: RevenueTarget[]
}> {
  const [
    { data: rawClients },
    { data: rawProjects },
    { data: rawAllocations },
    { data: rawTargets },
  ] = await Promise.all([
    supabase
      .from('pipeline_clients')
      .select('*')
      .in('entity_id', entityIds)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('pipeline_projects')
      .select('*')
      .in('entity_id', entityIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_allocations')
      .select('*, pipeline_projects!inner(entity_id)')
      .in('pipeline_projects.entity_id', entityIds)
      .gte('month', months[0])
      .lte('month', months[months.length - 1]),
    supabase
      .from('revenue_targets')
      .select('*')
      .in('entity_id', entityIds)
      .gte('month', months[0])
      .lte('month', months[months.length - 1]),
  ])

  const clients = (rawClients ?? []).map(mapClient)
  const allocs = (rawAllocations ?? []).map(mapAllocation)
  const targets = (rawTargets ?? []).map(mapTarget)

  const clientMap = new Map(clients.map((c) => [c.id, c.name]))

  const projects: PipelineProjectRow[] = (rawProjects ?? []).map((row) => {
    const proj = mapProject(row)
    const projAllocs = allocs.filter((a) => a.projectId === proj.id)
    return {
      ...proj,
      clientName: clientMap.get(proj.clientId) ?? 'Unknown',
      allocations: projAllocs,
      totalAmount: projAllocs.reduce((s, a) => s + a.amount, 0),
    }
  })

  return { clients, projects, targets }
}

/** Load entities for the Augusto Group */
export async function loadEntities(supabase: SupabaseClient, groupId: string) {
  const { data } = await supabase
    .from('entities')
    .select('id, name, code')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

/** Load forecast periods (week_endings) for building the period map */
export async function loadForecastPeriods(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('forecast_periods')
    .select('id, week_ending')
    .order('week_ending')
  return (data ?? []).map((r) => ({ id: r.id, weekEnding: r.week_ending }))
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/pipeline/queries.ts
git commit -m "feat(pipeline): data query functions for pipeline pages"
```

---

### Task 7: Server Actions — Pipeline CRUD & Sync

**Files:**
- Create: `app/(app)/pipeline/actions.ts`

- [ ] **Step 1: Implement server actions**

```typescript
// app/(app)/pipeline/actions.ts
'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { computeSyncLines } from '@/lib/pipeline/sync-engine'
import { getWeeksInMonth } from '@/lib/pipeline/fiscal-year'

// ── Schemas ──

const CreateProjectSchema = z.object({
  clientName: z.string().min(1),
  entityId: z.string().uuid(),
  jobNumber: z.string().optional(),
  projectName: z.string().min(1),
  taskEstimate: z.string().optional(),
  stage: z.enum(['confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined']),
  teamMember: z.string().optional(),
  billingAmount: z.number().optional(),
  thirdPartyCosts: z.number().optional(),
  invoiceDate: z.string().optional(),
  notes: z.string().optional(),
})

const UpdateAllocationsSchema = z.object({
  projectId: z.string().uuid(),
  allocations: z.array(z.object({
    month: z.string(),
    amount: z.number(),
    distribution: z.enum(['even', 'first_week', 'last_week', 'custom']).default('even'),
  })),
})

const UpdateTargetsSchema = z.object({
  targets: z.array(z.object({
    entityId: z.string().uuid(),
    month: z.string(),
    targetAmount: z.number(),
  })),
})

// ── Actions ──

export async function createProject(input: z.infer<typeof CreateProjectSchema>) {
  const user = await requireAuth()
  const parsed = CreateProjectSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const admin = createAdminClient()
  const { clientName, entityId, ...projectFields } = parsed.data

  // Upsert client
  const { data: client, error: clientErr } = await admin
    .from('pipeline_clients')
    .upsert({ entity_id: entityId, name: clientName }, { onConflict: 'entity_id,name' })
    .select()
    .single()

  if (clientErr) return { error: `Failed to create client: ${clientErr.message}` }

  // Compute gross_profit if billing provided
  const grossProfit =
    projectFields.billingAmount != null && projectFields.thirdPartyCosts != null
      ? projectFields.billingAmount - projectFields.thirdPartyCosts
      : null

  // Insert project
  const { data: project, error: projErr } = await admin
    .from('pipeline_projects')
    .insert({
      client_id: client.id,
      entity_id: entityId,
      job_number: projectFields.jobNumber || null,
      project_name: projectFields.projectName,
      task_estimate: projectFields.taskEstimate || null,
      stage: projectFields.stage,
      team_member: projectFields.teamMember || null,
      billing_amount: projectFields.billingAmount ?? null,
      third_party_costs: projectFields.thirdPartyCosts ?? null,
      gross_profit: grossProfit,
      invoice_date: projectFields.invoiceDate || null,
      notes: projectFields.notes || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (projErr) return { error: `Failed to create project: ${projErr.message}` }

  revalidatePath('/pipeline')
  return { data: project }
}

export async function updateProjectStage(projectId: string, stage: string) {
  await requireAuth()
  const admin = createAdminClient()

  const validStages = ['confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined']
  if (!validStages.includes(stage)) return { error: 'Invalid stage' }

  const { error } = await admin
    .from('pipeline_projects')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', projectId)

  if (error) return { error: error.message }

  // Re-sync this project
  await syncProject(projectId)

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function updateAllocations(input: z.infer<typeof UpdateAllocationsSchema>) {
  await requireAuth()
  const parsed = UpdateAllocationsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const admin = createAdminClient()
  const { projectId, allocations } = parsed.data

  // Upsert each allocation
  for (const alloc of allocations) {
    if (alloc.amount === 0) {
      // Delete zero allocations
      await admin
        .from('pipeline_allocations')
        .delete()
        .eq('project_id', projectId)
        .eq('month', alloc.month)
    } else {
      await admin
        .from('pipeline_allocations')
        .upsert(
          {
            project_id: projectId,
            month: alloc.month,
            amount: alloc.amount,
            distribution: alloc.distribution,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,month' },
        )
    }
  }

  // Re-sync this project
  await syncProject(projectId)

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function updateTargets(input: z.infer<typeof UpdateTargetsSchema>) {
  await requireAuth()
  const parsed = UpdateTargetsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const admin = createAdminClient()

  for (const t of parsed.data.targets) {
    await admin
      .from('revenue_targets')
      .upsert(
        {
          entity_id: t.entityId,
          month: t.month,
          target_amount: t.targetAmount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'entity_id,month' },
      )
  }

  revalidatePath('/pipeline')
  revalidatePath('/pipeline/summary')
  revalidatePath('/pipeline/targets')
  return { ok: true }
}

export async function deleteProject(projectId: string) {
  await requireAuth()
  const admin = createAdminClient()

  // Delete synced forecast_lines first
  await admin
    .from('forecast_lines')
    .delete()
    .eq('source_pipeline_project_id', projectId)

  // Cascade deletes allocations via FK
  const { error } = await admin
    .from('pipeline_projects')
    .delete()
    .eq('id', projectId)

  if (error) return { error: error.message }

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function toggleProjectSync(projectId: string, isSynced: boolean) {
  await requireAuth()
  const admin = createAdminClient()

  await admin
    .from('pipeline_projects')
    .update({ is_synced: isSynced, updated_at: new Date().toISOString() })
    .eq('id', projectId)

  if (isSynced) {
    await syncProject(projectId)
  } else {
    // Remove synced forecast_lines (orphan them)
    await admin
      .from('forecast_lines')
      .delete()
      .eq('source_pipeline_project_id', projectId)
  }

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

// ── Internal sync helper ──

async function syncProject(projectId: string) {
  const admin = createAdminClient()

  // Load project
  const { data: project } = await admin
    .from('pipeline_projects')
    .select('*, pipeline_clients(name)')
    .eq('id', projectId)
    .single()

  if (!project || !project.is_synced) return

  // Load allocations
  const { data: allocations } = await admin
    .from('pipeline_allocations')
    .select('*')
    .eq('project_id', projectId)

  // Load periods
  const { data: periods } = await admin
    .from('forecast_periods')
    .select('id, week_ending')
    .order('week_ending')

  // Find AR category
  const { data: arCategory } = await admin
    .from('categories')
    .select('id')
    .eq('code', 'inflows_ar')
    .single()

  // Find default bank account for entity
  const { data: bankAccount } = await admin
    .from('bank_accounts')
    .select('id')
    .eq('entity_id', project.entity_id)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!arCategory || !bankAccount) return

  const allWeekEndings = (periods ?? []).map((p) => p.week_ending)
  const periodMap: Record<string, string> = {}
  for (const p of periods ?? []) {
    periodMap[p.week_ending] = p.id
  }

  // Delete existing synced lines for this project
  await admin
    .from('forecast_lines')
    .delete()
    .eq('source_pipeline_project_id', projectId)

  // Build new lines from all allocations
  const clientName = (project.pipeline_clients as any)?.name ?? 'Unknown'
  const newLines: any[] = []

  for (const rawAlloc of allocations ?? []) {
    const allocation = {
      id: rawAlloc.id,
      projectId: rawAlloc.project_id,
      month: rawAlloc.month,
      amount: Number(rawAlloc.amount) || 0,
      distribution: rawAlloc.distribution as any,
    }
    const weekEndings = getWeeksInMonth(allWeekEndings, allocation.month)

    const lines = computeSyncLines({
      allocation,
      stage: project.stage,
      entityId: project.entity_id,
      projectId: project.id,
      clientName,
      bankAccountId: bankAccount.id,
      arCategoryId: arCategory.id,
      weekEndings,
      periodMap,
    })

    for (const line of lines) {
      newLines.push({
        entity_id: line.entityId,
        category_id: line.categoryId,
        period_id: line.periodId,
        bank_account_id: line.bankAccountId,
        amount: line.amount,
        confidence: line.confidence,
        source: 'pipeline',
        source_pipeline_project_id: line.sourcePipelineProjectId,
        counterparty: line.counterparty,
        line_status: line.lineStatus,
      })
    }
  }

  // Batch insert
  if (newLines.length > 0) {
    await admin.from('forecast_lines').insert(newLines)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(app\)/pipeline/actions.ts
git commit -m "feat(pipeline): server actions for CRUD and sync"
```

---

### Task 8: Sidebar Navigation Update

**Files:**
- Modify: `components/ui/sidebar.tsx`

- [ ] **Step 1: Read the current sidebar**

Read `components/ui/sidebar.tsx` to see the exact current structure.

- [ ] **Step 2: Add Pipeline section with sub-items**

Add a `Pipeline` nav group to the sidebar with sub-items: Pipeline, Summary, Targets. Use the existing `navItems` pattern but extend it to support nested items. The sidebar uses `usePathname()` for active state. Add the Pipeline group between Documents and Settings in the navigation order.

Add an icon import — use a chart/bar icon from the same icon source the sidebar already uses (likely lucide-react or heroicons). If no icon library is imported, use an inline SVG or a simple text icon.

The pipeline section should highlight "Pipeline" when on any `/pipeline/*` route, and highlight the specific sub-item when on that exact route.

- [ ] **Step 3: Verify the sidebar renders**

Run: `cd clients/augusto-cashflow && npm run dev`
Open browser to `http://localhost:3000` — verify Pipeline appears in sidebar with 3 sub-items.

- [ ] **Step 4: Commit**

```bash
git add components/ui/sidebar.tsx
git commit -m "feat(pipeline): add pipeline section to sidebar navigation"
```

---

### Task 9: Stage Badge Component

**Files:**
- Create: `components/pipeline/stage-badge.tsx`

- [ ] **Step 1: Create the stage badge component**

```tsx
// components/pipeline/stage-badge.tsx
'use client'

import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/lib/types'
import { STAGE_DISPLAY } from '@/lib/pipeline/types'

const colorClasses: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  zinc: 'bg-zinc-50 text-zinc-500 ring-zinc-500/10',
}

export function StageBadge({ stage, className }: { stage: PipelineStage; className?: string }) {
  const display = STAGE_DISPLAY[stage]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        colorClasses[display.color] ?? colorClasses.zinc,
        className,
      )}
    >
      {display.label}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/pipeline/stage-badge.tsx
git commit -m "feat(pipeline): stage badge component"
```

---

### Task 10: Fiscal Year Navigation Component

**Files:**
- Create: `components/pipeline/fiscal-year-nav.tsx`

- [ ] **Step 1: Create the fiscal year nav component**

```tsx
// components/pipeline/fiscal-year-nav.tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'

export function FiscalYearNav() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentFY = getCurrentFiscalYear()
  const fy = parseInt(searchParams.get('fy') ?? String(currentFY), 10)

  function navigate(newFy: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fy', String(newFy))
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate(fy - 1)}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50"
        aria-label="Previous fiscal year"
      >
        &larr;
      </button>
      <span className="text-sm font-semibold text-zinc-900">
        FY{fy} ({fy - 1}/{fy})
      </span>
      <button
        onClick={() => navigate(fy + 1)}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50"
        aria-label="Next fiscal year"
      >
        &rarr;
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/pipeline/fiscal-year-nav.tsx
git commit -m "feat(pipeline): fiscal year navigation component"
```

---

### Task 11: Pipeline Grid Page — Main View

**Files:**
- Create: `app/(app)/pipeline/page.tsx`
- Create: `components/pipeline/pipeline-grid.tsx`
- Create: `components/pipeline/project-drawer.tsx`
- Create: `components/pipeline/sync-status.tsx`

- [ ] **Step 1: Create the pipeline grid component**

Create `components/pipeline/pipeline-grid.tsx` — a table grouped by client, with sticky left columns (client name, job number, project name, task/estimate, team member, stage badge) and scrollable monthly columns + total. Features:

- Rows grouped by client name with collapsible headers (client name as a bold row, projects underneath)
- Each project row shows: job number, project name, task/estimate, team member, stage badge, 12 monthly amount cells, total
- Monthly cells are inline-editable (click to edit, blur/enter to save)
- Stage is a dropdown per row
- Sync status indicator per row
- Uses `useTransition` for calling `updateAllocations` and `updateProjectStage` actions on change
- "Add Project" button at top opens the project drawer

Props: `{ projects, entities, months, selectedEntityId, onEntityChange }` — all data pre-fetched server-side.

Use the same styling patterns as `components/forecast/forecast-grid.tsx` — zinc borders, white bg, `text-sm`, sticky columns with `sticky left-0 z-10 bg-white`.

- [ ] **Step 2: Create the project drawer component**

Create `components/pipeline/project-drawer.tsx` — a slide-over panel (fixed right, w-96) for adding/editing a project. Fields:

- Client name: text input with datalist autocomplete from existing clients
- Job number: text input (optional)
- Project name: text input (required)
- Task/estimate: text input (optional)
- Team member: text input (optional)
- Stage: select dropdown
- Invoice date: text input (optional, freeform)
- Notes: textarea (optional)
- **Optional section** (collapsible "Billing Breakdown"):
  - Billing amount: number input
  - Third party costs: number input
  - Gross profit: auto-calculated, read-only
- Sync to forecast: checkbox (default true)

Uses `createProject` server action on submit. Shows errors from action result.

- [ ] **Step 3: Create sync status indicator**

Create `components/pipeline/sync-status.tsx`:

```tsx
// components/pipeline/sync-status.tsx
'use client'

import { cn } from '@/lib/utils'

export function SyncStatus({ isSynced, className }: { isSynced: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        isSynced ? 'text-emerald-600' : 'text-zinc-400',
        className,
      )}
      title={isSynced ? 'Syncing to forecast' : 'Sync paused'}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isSynced ? 'bg-emerald-500' : 'bg-zinc-300')} />
      {isSynced ? 'Synced' : 'Paused'}
    </span>
  )
}
```

- [ ] **Step 4: Create the pipeline page (server component)**

Create `app/(app)/pipeline/page.tsx`:

```tsx
// app/(app)/pipeline/page.tsx
import { createClient } from '@/lib/supabase/server'
import { loadPipelineData, loadEntities, loadForecastPeriods } from '@/lib/pipeline/queries'
import { getFiscalYearMonths, getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { PipelineGrid } from '@/components/pipeline/pipeline-grid'
import { FiscalYearNav } from '@/components/pipeline/fiscal-year-nav'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; entity?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const currentFY = getCurrentFiscalYear()
  const fy = parseInt(params.fy ?? String(currentFY), 10)
  const months = getFiscalYearMonths(fy)

  const entities = await loadEntities(supabase, AUGUSTO_GROUP_ID)
  const entityIds = entities.map((e) => e.id)
  const selectedEntityId = params.entity ?? entityIds[0] ?? ''

  const { clients, projects, targets } = await loadPipelineData(supabase, entityIds, months)

  // Filter projects by selected entity
  const filteredProjects = selectedEntityId
    ? projects.filter((p) => p.entityId === selectedEntityId)
    : projects

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Revenue Pipeline</h1>
        <FiscalYearNav />
      </div>

      <PipelineGrid
        projects={filteredProjects}
        clients={clients}
        entities={entities}
        months={months}
        selectedEntityId={selectedEntityId}
      />
    </div>
  )
}
```

- [ ] **Step 5: Verify in browser**

Run: `cd clients/augusto-cashflow && npm run dev`
Navigate to `http://localhost:3000/pipeline`. Verify:
- Page renders with fiscal year nav
- Entity selector works
- Grid shows (empty — no data yet)
- "Add Project" opens drawer
- Creating a project works and appears in grid

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/pipeline/page.tsx components/pipeline/pipeline-grid.tsx components/pipeline/project-drawer.tsx components/pipeline/sync-status.tsx
git commit -m "feat(pipeline): main pipeline grid page with project drawer"
```

---

### Task 12: Pipeline Summary Page

**Files:**
- Create: `app/(app)/pipeline/summary/page.tsx`
- Create: `components/pipeline/summary-table.tsx`

- [ ] **Step 1: Create the summary table component**

Create `components/pipeline/summary-table.tsx` — a read-only table that matches the Excel BU SUMMARY structure. For each entity, shows 6 rows: Confirmed + Awaiting, Upcoming & Speculative, Total Forecast, Target, Variance, P&L Forecast. Columns: 12 months + Total.

- GROUP total row at bottom sums all entities
- Conditional formatting: red text for negative variance, green for positive
- Uses `computeBUSummary` from `lib/pipeline/summary.ts`
- Use `getMonthLabel` from fiscal-year.ts for column headers (APR, MAY, etc.)
- Format numbers as currency with `formatCurrency` from `@/lib/utils`

- [ ] **Step 2: Create the summary page**

```tsx
// app/(app)/pipeline/summary/page.tsx
import { createClient } from '@/lib/supabase/server'
import { loadPipelineData, loadEntities } from '@/lib/pipeline/queries'
import { getFiscalYearMonths, getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'
import { computeBUSummary } from '@/lib/pipeline/summary'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { SummaryTable } from '@/components/pipeline/summary-table'
import { FiscalYearNav } from '@/components/pipeline/fiscal-year-nav'

export default async function PipelineSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const currentFY = getCurrentFiscalYear()
  const fy = parseInt(params.fy ?? String(currentFY), 10)
  const months = getFiscalYearMonths(fy)

  const entities = await loadEntities(supabase, AUGUSTO_GROUP_ID)
  const entityIds = entities.map((e) => e.id)

  const { projects, targets } = await loadPipelineData(supabase, entityIds, months)
  const summaryRows = computeBUSummary(
    projects,
    entities.map((e) => ({ id: e.id, name: e.name })),
    targets,
    months,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Pipeline Summary</h1>
        <FiscalYearNav />
      </div>

      <SummaryTable rows={summaryRows} months={months} />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/pipeline/summary`. Verify:
- BU summary table renders with all entities
- Month columns show correctly
- GROUP total row sums all entities
- Variance shows red/green formatting

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/pipeline/summary/page.tsx components/pipeline/summary-table.tsx
git commit -m "feat(pipeline): BU summary page with variance tracking"
```

---

### Task 13: Targets Management Page

**Files:**
- Create: `app/(app)/pipeline/targets/page.tsx`
- Create: `components/pipeline/target-grid.tsx`

- [ ] **Step 1: Create the target grid component**

Create `components/pipeline/target-grid.tsx` — an editable grid. One row per entity, 12 monthly columns. Each cell is a number input. "Save" button at top calls `updateTargets` action with all changed values. Uses `useTransition` for pending state.

- [ ] **Step 2: Create the targets page**

```tsx
// app/(app)/pipeline/targets/page.tsx
import { createClient } from '@/lib/supabase/server'
import { loadEntities } from '@/lib/pipeline/queries'
import { getFiscalYearMonths, getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'
import { AUGUSTO_GROUP_ID } from '@/lib/types'
import { TargetGrid } from '@/components/pipeline/target-grid'
import { FiscalYearNav } from '@/components/pipeline/fiscal-year-nav'

export default async function PipelineTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const currentFY = getCurrentFiscalYear()
  const fy = parseInt(params.fy ?? String(currentFY), 10)
  const months = getFiscalYearMonths(fy)

  const entities = await loadEntities(supabase, AUGUSTO_GROUP_ID)
  const entityIds = entities.map((e) => e.id)

  const { data: rawTargets } = await supabase
    .from('revenue_targets')
    .select('*')
    .in('entity_id', entityIds)
    .gte('month', months[0])
    .lte('month', months[months.length - 1])

  const targets = (rawTargets ?? []).map((t) => ({
    entityId: t.entity_id,
    month: t.month,
    targetAmount: Number(t.target_amount) || 0,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Revenue Targets</h1>
        <FiscalYearNav />
      </div>

      <TargetGrid entities={entities} months={months} targets={targets} />
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/pipeline/targets`. Verify:
- Grid renders with entity rows and month columns
- Can edit target values
- Save persists values and they survive page reload

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/pipeline/targets/page.tsx components/pipeline/target-grid.tsx
git commit -m "feat(pipeline): revenue targets management page"
```

---

### Task 14: Forecast Grid — Pipeline Badge

**Files:**
- Modify: `components/forecast/forecast-grid.tsx`

- [ ] **Step 1: Read the current forecast grid component**

Read `components/forecast/forecast-grid.tsx` to understand the row rendering logic.

- [ ] **Step 2: Add pipeline badge to synced lines**

Where forecast_lines are rendered as rows, check if `source === 'pipeline'`. If so:
- Show a small "Pipeline" badge (use the existing Badge component with variant `'pipeline'`)
- Make the amount cell read-only (remove edit handler, show muted cursor)
- Add a tooltip (title attribute) showing the counterparty name

This is a small change — add a conditional check in the row rendering logic, not a rewrite.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:3000/forecast`. If any pipeline-synced lines exist, verify:
- They show a "Pipeline" badge
- Their amounts are not editable
- Hover shows counterparty name

- [ ] **Step 4: Commit**

```bash
git add components/forecast/forecast-grid.tsx
git commit -m "feat(pipeline): pipeline badge on synced forecast lines"
```

---

### Task 15: Excel Import Parser

**Files:**
- Create: `lib/pipeline/excel-import.ts`
- Create: `tests/unit/pipeline-excel-import.test.ts`

- [ ] **Step 1: Write tests for the Excel parser**

```typescript
// tests/unit/pipeline-excel-import.test.ts
import { describe, it, expect } from 'vitest'
import { parseRevenueTrackerSheet, mapExcelStage } from '@/lib/pipeline/excel-import'

describe('mapExcelStage', () => {
  it('maps "Confirmed" to confirmed', () => {
    expect(mapExcelStage('Confirmed')).toBe('confirmed')
  })
  it('maps "Awaiting budget approval from client" to awaiting_approval', () => {
    expect(mapExcelStage('Awaiting budget approval from client')).toBe('awaiting_approval')
    expect(mapExcelStage('Awaiting budget approval from clien')).toBe('awaiting_approval')
  })
  it('maps "Upcoming work, spoken to client" to upcoming', () => {
    expect(mapExcelStage('Upcoming work, spoken to client,  but no formal budget')).toBe('upcoming')
    expect(mapExcelStage('Upcoming work, spoken to client, but no formal')).toBe('upcoming')
  })
  it('maps "Speculative" to speculative', () => {
    expect(mapExcelStage('Speculative')).toBe('speculative')
  })
  it('maps "DECLINED" to declined', () => {
    expect(mapExcelStage('DECLINED')).toBe('declined')
  })
  it('defaults to speculative for unknown stages', () => {
    expect(mapExcelStage('Something else')).toBe('speculative')
    expect(mapExcelStage('')).toBe('speculative')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-excel-import.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Excel parser**

```typescript
// lib/pipeline/excel-import.ts
import ExcelJS from 'exceljs'
import type { PipelineStage } from '@/lib/types'

export interface ImportedProject {
  entityCode: string
  clientName: string
  jobNumber: string | null
  projectName: string
  taskEstimate: string | null
  stage: PipelineStage
  teamMember: string | null
  billingAmount: number | null
  thirdPartyCosts: number | null
  notes: string | null
  allocations: { month: string; amount: number }[]
}

export interface ImportedTarget {
  entityCode: string
  month: string
  amount: number
}

export interface ImportResult {
  projects: ImportedProject[]
  targets: ImportedTarget[]
  errors: string[]
}

/** Map Excel stage strings to app stages */
export function mapExcelStage(raw: string): PipelineStage {
  const s = (raw ?? '').trim().toLowerCase()
  if (s === 'confirmed') return 'confirmed'
  if (s.startsWith('awaiting budget approval')) return 'awaiting_approval'
  if (s.startsWith('upcoming work')) return 'upcoming'
  if (s === 'speculative') return 'speculative'
  if (s === 'declined') return 'declined'
  return 'speculative'
}

/** Entity sheet name → entity code mapping */
const SHEET_ENTITY_MAP: Record<string, string> = {
  AUGUSTO: 'AUG',
  'CORNERSTORE 202627': 'CNR',
  BALLYHOO: 'BAL',
  'DARK DORIS': 'DD',
  WRESTLER: 'WRS',
}

/** Month column headers → ISO month dates for FY2027 (Apr 2026 - Mar 2027) */
const MONTH_MAP: Record<string, string> = {
  april: '2026-04-01',
  may: '2026-05-01',
  june: '2026-06-01',
  july: '2026-07-01',
  august: '2026-08-01',
  september: '2026-09-01',
  october: '2026-10-01',
  november: '2026-11-01',
  december: '2026-12-01',
  january: '2027-01-01',
  february: '2027-02-01',
  march: '2027-03-01',
}

/**
 * Parse the full revenue tracker workbook.
 * Returns projects and targets extracted from all entity sheets.
 */
export async function parseRevenueTracker(buffer: ArrayBuffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const projects: ImportedProject[] = []
  const targets: ImportedTarget[] = []
  const errors: string[] = []

  for (const [sheetName, entityCode] of Object.entries(SHEET_ENTITY_MAP)) {
    const ws = wb.getWorksheet(sheetName)
    if (!ws) {
      errors.push(`Sheet "${sheetName}" not found`)
      continue
    }

    try {
      const result = parseEntitySheet(ws, entityCode)
      projects.push(...result.projects)
      targets.push(...result.targets)
      errors.push(...result.errors.map((e) => `[${sheetName}] ${e}`))
    } catch (err) {
      errors.push(`[${sheetName}] Parse error: ${err}`)
    }
  }

  return { projects, targets, errors }
}

function parseEntitySheet(
  ws: ExcelJS.Worksheet,
  entityCode: string,
): { projects: ImportedProject[]; targets: ImportedTarget[]; errors: string[] } {
  const projects: ImportedProject[] = []
  const targets: ImportedTarget[] = []
  const errors: string[] = []

  // Find the month columns by scanning header rows (usually row 2-6)
  // and the data start row (the row with entity name in column 1, followed by project rows)
  // This is heuristic — each sheet has slightly different layout

  // Find month header row (contains "April", "May", etc.)
  let monthRow = -1
  let monthCols: { col: number; month: string }[] = []

  for (let r = 1; r <= 15; r++) {
    const row = ws.getRow(r)
    const cols: { col: number; month: string }[] = []
    for (let c = 1; c <= 25; c++) {
      const val = getCellString(row.getCell(c))
      const monthKey = val.toLowerCase().trim()
      if (MONTH_MAP[monthKey]) {
        cols.push({ col: c, month: MONTH_MAP[monthKey] })
      }
    }
    if (cols.length >= 10) {
      monthRow = r
      monthCols = cols
      break
    }
  }

  if (monthRow === -1) {
    errors.push('Could not find month header row')
    return { projects, targets, errors }
  }

  // Find target row (contains "target" or "Monthly target")
  for (let r = monthRow + 1; r <= monthRow + 10; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= 10; c++) {
      const val = getCellString(row.getCell(c)).toLowerCase()
      if (val.includes('target') && !val.includes('forecast')) {
        for (const mc of monthCols) {
          const amt = getCellNumber(row.getCell(mc.col))
          if (amt > 0) {
            targets.push({ entityCode, month: mc.month, amount: amt })
          }
        }
        break
      }
    }
  }

  // Find data rows — look for the row that has the entity name header
  // then scan subsequent rows for project data
  let dataStartRow = monthRow + 2
  let currentClient = ''

  for (let r = dataStartRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)

    // Skip empty rows and total/summary rows
    const firstCellRaw = getCellString(row.getCell(1))
    const secondCellRaw = getCellString(row.getCell(2))

    if (firstCellRaw.toLowerCase().includes('total')) break
    if (secondCellRaw.toLowerCase().includes('total')) break

    // Check if this is a client header row (has text in first columns but no amounts)
    const hasAmounts = monthCols.some((mc) => getCellNumber(row.getCell(mc.col)) !== 0)

    if (firstCellRaw && !hasAmounts && !secondCellRaw) {
      // Client header row
      currentClient = firstCellRaw.trim()
      continue
    }

    // Check if this is a project row (has amounts in month columns)
    if (!hasAmounts) continue
    if (!currentClient && !firstCellRaw) continue

    // Extract project data — find stage and other fields
    // Stage column varies by sheet, so we scan for known stage values
    let stage: PipelineStage = 'speculative'
    let jobNumber: string | null = null
    let projectName = ''
    let taskEstimate: string | null = null
    let teamMember: string | null = null
    let notes: string | null = null

    // Scan non-month columns for metadata
    for (let c = 1; c <= Math.min(10, monthCols[0]?.col ?? 10); c++) {
      const val = getCellString(row.getCell(c)).trim()
      if (!val) continue

      const mapped = mapExcelStage(val)
      if (mapped !== 'speculative' || val.toLowerCase() === 'speculative') {
        if (val.toLowerCase().startsWith('confirmed') ||
            val.toLowerCase().startsWith('awaiting') ||
            val.toLowerCase().startsWith('upcoming') ||
            val.toLowerCase() === 'speculative' ||
            val.toLowerCase() === 'declined') {
          stage = mapped
          continue
        }
      }

      // Heuristic field assignment based on column position
      if (c === 1 && val !== currentClient) teamMember = val
      if (c === 2 && val.match(/^[A-Z]{3,4}_/)) jobNumber = val
      if (c === 3 && !projectName) projectName = val
      if (c === 4 && !taskEstimate) taskEstimate = val
    }

    if (!projectName && taskEstimate) {
      projectName = taskEstimate
      taskEstimate = null
    }
    if (!projectName) projectName = `${currentClient} project`

    // Extract monthly allocations
    const allocations: { month: string; amount: number }[] = []
    for (const mc of monthCols) {
      const amt = getCellNumber(row.getCell(mc.col))
      if (amt !== 0) {
        allocations.push({ month: mc.month, amount: amt })
      }
    }

    if (allocations.length > 0) {
      projects.push({
        entityCode,
        clientName: currentClient || 'Unknown',
        jobNumber,
        projectName,
        taskEstimate,
        stage,
        teamMember,
        billingAmount: null,
        thirdPartyCosts: null,
        notes,
        allocations,
      })
    }
  }

  return { projects, targets, errors }
}

function getCellString(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '')
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

function getCellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && 'result' in v) {
    const r = v.result
    return typeof r === 'number' ? r : 0
  }
  const parsed = parseFloat(String(v))
  return isNaN(parsed) ? 0 : parsed
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd clients/augusto-cashflow && npx vitest run tests/unit/pipeline-excel-import.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/excel-import.ts tests/unit/pipeline-excel-import.test.ts
git commit -m "feat(pipeline): Excel revenue tracker import parser"
```

---

### Task 16: Excel Import UI

**Files:**
- Create: `app/(app)/pipeline/import/page.tsx`
- Add import action to: `app/(app)/pipeline/actions.ts`

- [ ] **Step 1: Add import server action**

Add to `app/(app)/pipeline/actions.ts`:

```typescript
export async function importFromExcel(formData: FormData) {
  const user = await requireAuth()
  const file = formData.get('file') as File
  if (!file || file.size === 0) return { error: 'No file provided' }

  const { parseRevenueTracker } = await import('@/lib/pipeline/excel-import')
  const buffer = await file.arrayBuffer()
  const result = await parseRevenueTracker(buffer)

  return {
    data: {
      projects: result.projects,
      targets: result.targets,
      errors: result.errors,
    },
  }
}

export async function commitImport(
  projects: any[],
  targets: any[],
  entityMap: Record<string, string>, // entityCode → entityId
) {
  const user = await requireAuth()
  const admin = createAdminClient()

  let created = 0

  for (const proj of projects) {
    const entityId = entityMap[proj.entityCode]
    if (!entityId) continue

    // Upsert client
    const { data: client } = await admin
      .from('pipeline_clients')
      .upsert({ entity_id: entityId, name: proj.clientName }, { onConflict: 'entity_id,name' })
      .select()
      .single()

    if (!client) continue

    // Insert project
    const { data: project } = await admin
      .from('pipeline_projects')
      .insert({
        client_id: client.id,
        entity_id: entityId,
        job_number: proj.jobNumber,
        project_name: proj.projectName,
        task_estimate: proj.taskEstimate,
        stage: proj.stage,
        team_member: proj.teamMember,
        billing_amount: proj.billingAmount,
        third_party_costs: proj.thirdPartyCosts,
        notes: proj.notes,
        created_by: user.id,
      })
      .select()
      .single()

    if (!project) continue

    // Insert allocations
    const allocRows = proj.allocations.map((a: any) => ({
      project_id: project.id,
      month: a.month,
      amount: a.amount,
    }))

    if (allocRows.length > 0) {
      await admin.from('pipeline_allocations').insert(allocRows)
    }

    // Sync to forecast
    await syncProject(project.id)
    created++
  }

  // Import targets
  for (const t of targets) {
    const entityId = entityMap[t.entityCode]
    if (!entityId) continue

    await admin
      .from('revenue_targets')
      .upsert(
        { entity_id: entityId, month: t.month, target_amount: t.amount },
        { onConflict: 'entity_id,month' },
      )
  }

  revalidatePath('/pipeline')
  revalidatePath('/pipeline/summary')
  revalidatePath('/pipeline/targets')
  revalidatePath('/forecast')

  return { ok: true, created }
}
```

Note: `syncProject` is already defined in the same file from Task 7.

- [ ] **Step 2: Create import page**

Create `app/(app)/pipeline/import/page.tsx` — a page with:
- File upload zone (accept .xlsx)
- On upload, calls `importFromExcel` action to parse
- Shows a review table: extracted projects grouped by entity, with stage, monthly totals, errors
- "Import All" button calls `commitImport`
- Shows success count and any errors

- [ ] **Step 3: Verify with the actual Excel file**

Run: `cd clients/augusto-cashflow && npm run dev`
Navigate to `http://localhost:3000/pipeline/import`. Upload `client_pipeline/Augusto/Agency Revenue Tracker 2026_27 (2).xlsx`. Verify:
- Parser extracts projects from all 5 entity sheets
- Stages map correctly
- Monthly amounts are extracted
- Targets are extracted
- Review screen shows correct data
- Import commits data to database
- Pipeline page shows imported projects
- Summary page shows correct totals

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/pipeline/actions.ts app/\(app\)/pipeline/import/page.tsx
git commit -m "feat(pipeline): Excel import with review UI"
```

---

### Task 17: Seed FY2027 Targets

**Files:**
- Create: `supabase/migrations/017_pipeline_seed.sql`

- [ ] **Step 1: Write seed migration with FY2027 targets from the Excel**

```sql
-- 017_pipeline_seed.sql
-- Seed FY2027 revenue targets from Agency Revenue Tracker Excel

-- Helper: get entity IDs by code
DO $$
DECLARE
  v_aug_id uuid;
  v_cnr_id uuid;
  v_bal_id uuid;
  v_dd_id uuid;
  v_wrs_id uuid;
  v_months text[] := ARRAY[
    '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01',
    '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01',
    '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01'
  ];
  v_month text;
BEGIN
  SELECT id INTO v_aug_id FROM entities WHERE code = 'AUG';
  SELECT id INTO v_cnr_id FROM entities WHERE code = 'CNR';
  SELECT id INTO v_bal_id FROM entities WHERE code = 'BAL';
  SELECT id INTO v_dd_id FROM entities WHERE code = 'DD';
  SELECT id INTO v_wrs_id FROM entities WHERE code = 'WRS';

  -- Augusto: $325,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_aug_id, v_month::date, 325000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Cornerstore: $150,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_cnr_id, v_month::date, 150000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Ballyhoo: $25,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_bal_id, v_month::date, 25000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Dark Doris: $25,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_dd_id, v_month::date, 25000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;

  -- Wrestler: $25,000/month
  FOREACH v_month IN ARRAY v_months LOOP
    INSERT INTO revenue_targets (entity_id, month, target_amount)
    VALUES (v_wrs_id, v_month::date, 25000)
    ON CONFLICT (entity_id, month) DO UPDATE SET target_amount = EXCLUDED.target_amount;
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply migration**

Run: `cd clients/augusto-cashflow && npx supabase db reset`
Expected: All 17 migrations apply, targets seeded.

- [ ] **Step 3: Verify targets appear on targets page**

Run dev server and navigate to `/pipeline/targets`. Verify all 5 entities show $325K/$150K/$25K per month.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/017_pipeline_seed.sql
git commit -m "feat(pipeline): seed FY2027 revenue targets from Excel"
```

---

### Task 18: Integration Test — Full Pipeline Flow

- [ ] **Step 1: Manual integration test**

With the dev server running and database seeded:

1. Navigate to `/pipeline/import`, upload the Excel file, review and import
2. Navigate to `/pipeline` — verify projects appear grouped by client per entity
3. Change a project stage from "speculative" to "confirmed" — verify stage badge updates
4. Edit a monthly allocation amount — verify total updates
5. Navigate to `/pipeline/summary` — verify BU summary matches Excel numbers
6. Navigate to `/pipeline/targets` — verify targets are editable
7. Navigate to `/forecast` — verify pipeline-synced lines appear with "Pipeline" badge
8. Toggle sync off on a project — verify its forecast_lines disappear
9. Toggle sync back on — verify they reappear

- [ ] **Step 2: Run all existing tests to check for regressions**

Run: `cd clients/augusto-cashflow && npx vitest run`
Expected: All existing tests pass plus the new pipeline tests.

- [ ] **Step 3: Run typecheck**

Run: `cd clients/augusto-cashflow && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(pipeline): integration verification — all tests pass"
```

# Revenue Pipeline Module — Design Spec

> Approved 2026-04-12. Integrates an agency revenue tracker into the Augusto Cash Flow app.

---

## Problem

Augusto Group (UFO Rodeo) manages revenue pipeline tracking across 5 business units in a 7-sheet Excel workbook ("Agency Revenue Tracker 2026/27"). The client service team maintains project-level revenue forecasts per month, grouped by client and business unit. Two key outputs feed other processes:

1. **Cash Forecast Figure** (Confirmed + Awaiting confirmation) — feeds the weekly cash flow forecast
2. **P&L Forecast Figure** (weighted by pipeline stage) — used for monthly P&L reporting

The cash flow app already tracks weekly cash flows with entities, categories, confidence, and scenarios. This spec adds a dedicated pipeline module that replaces the Excel and syncs revenue data into the existing forecast.

---

## Business Units (Entities)

The revenue tracker covers all entities already in the cash flow app:

| Entity | Code | Monthly Target (FY2027) | Notes |
|--------|------|------------------------|-------|
| Augusto | AUG | $325,000 | Net revenue only |
| Cornerstore | CNR | $150,000 | Tracks billing, 3rd party costs, gross profit |
| Ballyhoo | BAL | $25,000 | Events — tracks billing/costs/profit |
| Dark Doris | DD | $25,000 | Production — tracks billing/costs/profit |
| Wrestler | WRS | $25,000 | Video production — tracks billing/costs/profit |
| **Group Total** | | **$675,000** | |

---

## Data Model

### `pipeline_clients`

End-clients/brands that projects are for (adidas, AON, Lion, HelloFresh, etc.). Scoped per entity since the same client can appear under different BUs.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| entity_id | uuid FK→entities CASCADE | Which BU this client sits under |
| name | text NOT NULL | e.g., "adidas", "Lion", "HelloFresh" |
| is_active | boolean | Default true |
| notes | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Unique constraint:** (entity_id, lower(name))

### `pipeline_projects`

Individual jobs/projects within a client. Core pipeline item.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| client_id | uuid FK→pipeline_clients CASCADE | |
| entity_id | uuid FK→entities CASCADE | Denormalized for query convenience |
| job_number | text | e.g., "ADG_A0133" (nullable) |
| project_name | text NOT NULL | e.g., "Australian Open Reactive" |
| task_estimate | text | e.g., "Agency Fees - 10%" (nullable) |
| stage | text CHECK NOT NULL | 'confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined' |
| team_member | text | e.g., "Cara", "Jaz" (nullable) |
| billing_amount | numeric | Total client budget (nullable — full breakdown mode) |
| third_party_costs | numeric | External costs (nullable) |
| gross_profit | numeric | Billing minus costs (nullable) |
| invoice_date | text | Freeform, e.g., "April/May", "Monthly" (nullable) |
| notes | text | |
| is_synced | boolean | Default true — whether auto-sync is active |
| created_by | uuid FK→auth.users | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Indexes:** entity_id, client_id, stage

### `pipeline_allocations`

Monthly revenue distribution for each project. One row per project per month.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK→pipeline_projects CASCADE | |
| month | date NOT NULL | First of month, e.g., 2026-04-01 |
| amount | numeric NOT NULL | Revenue for this month |
| distribution | text CHECK | 'even', 'first_week', 'last_week', 'custom'. Default 'even' |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Unique constraint:** (project_id, month)

### `revenue_targets`

Monthly targets per entity.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| entity_id | uuid FK→entities CASCADE | |
| month | date NOT NULL | First of month |
| target_amount | numeric NOT NULL | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Unique constraint:** (entity_id, month)

### Changes to `forecast_lines`

One new column:

| Column | Type | Notes |
|--------|------|-------|
| source_pipeline_project_id | uuid FK→pipeline_projects SET NULL | Links pipeline-synced lines to source project. Nullable. |

**Index:** idx_forecast_lines_pipeline_project (where source_pipeline_project_id IS NOT NULL)

---

## Pipeline Stages & Confidence Mapping

### Stage Definitions

| Stage | Confidence | Color | Sync Behavior |
|-------|-----------|-------|---------------|
| confirmed | 100% | Green | Syncs at full amount |
| awaiting_approval | 80% | Amber | Syncs with 80% confidence |
| upcoming | 50% | Blue | Syncs with 50% confidence |
| speculative | 20% | Rose | Syncs with 20% confidence |
| declined | 0% | Gray | Not synced — kept for historical record |

### Two Output Figures

Computed views, not stored:

1. **Cash Forecast Figure** = sum of `confirmed` + `awaiting_approval` allocations (raw amounts, unweighted). Matches the Excel's "Confirmed + Awaiting confirmation" — the figure that feeds the weekly cash forecast.

2. **P&L Forecast Figure** = `confirmed` at 100% + `awaiting_approval` at 50% + `upcoming` at 50% + `speculative` at 50%. Matches the Excel's "Forecast figure for P&L" logic. Note: this is a separate summary calculation from the per-line confidence values used in the cash forecast sync (80%/50%/20%). The P&L figure is for reporting; confidence values drive the weighted cash forecast.

---

## Sync Engine: Pipeline → Forecast Lines

### Process

When a pipeline allocation syncs to the cash flow forecast:

1. **Determine target weeks** — find all `forecast_periods` whose `week_ending` falls within the allocation's month.

2. **Apply distribution rule:**
   - `even` — divide amount equally across weeks in that month
   - `first_week` — full amount on the first week of the month
   - `last_week` — full amount on the last week of the month
   - `custom` — future extension for per-week amounts

3. **Create/update `forecast_lines`** with:
   - `source = 'pipeline'`
   - `source_pipeline_project_id` → the project ID
   - `category_id` → "Accounts Receivable" (inflows_ar) by default
   - `confidence` → from stage mapping table above
   - `line_status` → mapped: confirmed→confirmed, awaiting_approval→awaiting_budget_approval, upcoming→tbc, speculative→speculative
   - `counterparty` → client name
   - `entity_id` → from project
   - `bank_account_id` → entity's default operating account

### Sync Triggers

- Pipeline project create/update/delete
- Allocation amount change
- Stage change (updates confidence + line_status on all linked forecast_lines)
- Manual "Re-sync" button for bulk refresh

### Sync is Idempotent

The sync engine deletes existing forecast_lines for a project+month and recreates them. Clean rebuild, no partial update complexity.

### Conflict Handling

- Pipeline-sourced forecast_lines are **read-only** in the forecast grid, marked with a "Pipeline" badge
- Tooltip on hover shows project name, client, stage
- To override: user sets `is_synced = false` on the project, which orphans the forecast_lines and makes them editable
- Overlapping manual lines: both coexist — the pipeline badge makes the source obvious

---

## Fiscal Year

- **Default fiscal year:** April–March (NZ standard)
- **Configurable:** `fiscal_year_start_month` stored in app config (integer 1-12, default 4)
- Pipeline views show 12 months from the current fiscal year start
- Revenue targets are per fiscal year
- Previous/next fiscal year navigation via arrows
- Fiscal year is a **UI filter only** — not a data constraint. Allocations and targets use calendar dates.

---

## UI Pages & Navigation

### New Sidebar Section: "Pipeline"

- Pipeline (project-level view)
- Summary (BU roll-up)
- Targets

### `/pipeline` — Main Pipeline View

A table grouped by client within the selected entity.

**Layout:**
- Entity selector dropdown at top
- Filter bar: by stage, by team member, by client
- Fiscal year selector

**Columns (sticky left):** Client name, job number, project name, task/estimate, team member, stage badge

**Columns (scrollable):** 12 monthly columns (Apr–Mar) + Total

**Features:**
- Inline editing for amounts and stage
- Grouped by client with collapsible sections
- Row-level stage dropdown with colored badge
- Add Project button opens project drawer
- Sync status indicator per project

### `/pipeline/summary` — BU Summary

Matches the Excel "BU SUMMARY" sheet structure.

**Rows per entity:**
- Confirmed + Awaiting confirmation
- Upcoming & Speculative
- Total Forecast
- Target
- Variance
- P&L Forecast Figure

**Columns:** 12 months + Total

**GROUP row** at bottom sums all entities.

**Formatting:** Red for negative variance, green when exceeding target.

### `/pipeline/targets` — Target Management

Simple editable grid. One row per entity, 12 monthly columns. Save button.

### Key Components

- **`pipeline-grid.tsx`** — Main monthly grid with inline editing, grouped by client
- **`pipeline-summary-table.tsx`** — Read-only summary with conditional formatting
- **`project-drawer.tsx`** — Slide-over for add/edit project. Fields: client (autocomplete/create new), job number, project name, task/estimate, team member, stage, billing/costs/profit (optional section), invoice date, notes, sync toggle
- **`stage-badge.tsx`** — Colored pill showing pipeline stage
- **`sync-status-indicator.tsx`** — Shows sync state and last sync timestamp

### Forecast Grid Changes

- Pipeline-sourced forecast_lines show a "Pipeline" badge and are read-only
- Tooltip on hover: project name, client, stage
- Existing manual lines unaffected

---

## Excel Import

One-time import capability for initial data load from the existing revenue tracker Excel.

### Process

1. User uploads the revenue tracker Excel on `/pipeline`
2. Parser reads each entity sheet (AUGUSTO, CORNERSTORE, BALLYHOO, DARK DORIS, WRESTLER)
3. Extracts per sheet:
   - Client names (grouped row headers)
   - Project rows: job number, project name, task/estimate, stage, monthly amounts, notes
   - Team member (where present)
   - Billing/costs/profit (where present — Cornerstore, Ballyhoo, Dark Doris, Wrestler)
   - Monthly targets from the summary section
4. Shows a review screen before committing — user can fix mis-parsed data
5. Creates pipeline_clients, pipeline_projects, pipeline_allocations, revenue_targets records
6. Triggers sync engine to generate forecast_lines

### Parser Details

- Each sheet has a known layout: header rows (1–13), then project data rows starting at row 14-16
- Client names are in the leftmost non-empty cell of a "group header" row (a row with a name but no amounts)
- Project rows have amounts in the monthly columns
- Stage is read from the status column (maps "Confirmed" → confirmed, "Awaiting budget approval from client" → awaiting_approval, "Upcoming work, spoken to client" → upcoming, "Speculative" → speculative, "DECLINED" → declined)
- The parser is deterministic — no AI extraction needed
- TOTAL/summary rows are skipped (detected by "TOTAL" label or formula markers)

---

## Edge Cases

**Project stage → declined:** All linked forecast_lines are removed. Moving back re-creates them via sync.

**Allocation amount change:** Sync engine deletes old forecast_lines for that project+month and creates new ones.

**Entity scope:** A project cannot move between entities. To reassign, decline the old project and create a new one under the correct entity.

**Month–week boundary:** A `week_ending` date that spans two months belongs to whichever month contains the `week_ending` date.

**No AI integration:** Pipeline entry is structured manual input. The existing AI document processing feature is for invoices/statements — a separate workflow that doesn't interact with the pipeline module.

---

## Not In Scope

- Per-user access controls (single team manages everything)
- Win rate / conversion tracking (future enhancement)
- Actual vs forecast comparison (future — needs actuals data source)
- Custom per-week distribution (future — 'custom' distribution type is defined but not implemented)
- Pipeline-level scenario overrides (future — could wire into existing scenario_overrides table)

# Augusto Cash Flow — Handoff Guide

## Quick Start

1. Clone this repository
2. Copy `.env.example` to `.env.local` and fill in values
3. `npm install`
4. Set up Supabase:
   - Create a project at https://supabase.com
   - Copy the URL, anon key, and service role key to `.env.local`
   - Run `npx supabase db push` to apply migrations
   - Run `npx supabase db reset` to seed data (entities, categories, etc.)
5. `npm run dev` — open http://localhost:3000
6. Create users in Supabase Auth dashboard

## Deploy to Vercel

1. Push to GitHub
2. Connect repo in Vercel
3. Set environment variables in Vercel project settings
4. Deploy

## Architecture

- **Next.js 15** App Router with Server Components and Server Actions
- **Supabase** for auth, database, file storage
- **AI Document Processing** via Claude (OpenRouter) for extracting financial data from uploaded documents
- **Forecast Engine** — pure functions that compute weekly summaries from line items

## Key Concepts

- **Recurring Rules** auto-generate forecast lines (payroll, rent, PAYE). Set once in Settings > Recurring Rules.
- **Pipeline Items** are forecast lines with confidence < 100%. Shown in amber in the grid.
- **Scenarios** (Base/Best/Worst) adjust pipeline confidence without duplicating data.
- **Documents** — upload any file, AI extracts financial data, you review and confirm into the forecast.
- **Scenario Overrides** — per-item tweaks to amount / confidence / week / exclusion on top of a scenario. Managed at `/forecast/overrides`. Applied on top of the blanket Best/Worst confidence transform, which yields to any explicit `override_confidence` so user overrides win.

## Forecast Detail editing (Excel-like)

The `/forecast/detail` grid behaves like a spreadsheet. All edits save to the server in the background while the UI updates instantly.

- **Click a cell** — enter edit mode. Type a number, or start with `=` to enter a formula (`=1500*4`, `=(5000+250)/2`, `=-3200`). Formulas support `+ - * /` and parentheses. Cell references (`A1`, `B2`) are NOT supported in this version.
- **Enter** saves and moves down. **Shift+Enter** up. **Tab** right. **Shift+Tab** left. **Esc** cancels the edit.
- **Arrow keys** (not editing) move the focused cell. **Delete** / **Backspace** clear the cell to 0.
- **Digits / `-` / `.` / `=`** (not editing) enter edit mode with that character as the initial draft.
- **Click + drag** to select a rectangular range. **Shift+click** extends a selection. **Shift+Arrow** extends one cell at a time.
- **Ctrl/Cmd+C** copies the selection as TSV to the clipboard (Excel-compatible). **Ctrl/Cmd+V** pastes starting at the top-left of the current selection. Strips `$`, `,`, and parens (`(500)` → -500). Pipeline-sourced cells and cells without an underlying line are skipped.
- **Fill-handle** — small indigo square at the bottom-right of the selection. Drag down or right to copy the source value across the range. Constant fill only (no series extrapolation).
- **Subtotal cells are editable** where at least one underlying line is non-pipeline. Edit a subtotal and it prorates to the lines below proportionally (or evenly if all source lines are 0). Pipeline-sourced lines are skipped in proration.
- **Save status chip** in the toolbar shows Saving… / Saved (1.5s) / Save failed (4s). Failures revert the optimistic edit automatically.

Single-user only for now — no realtime sync across sessions. If two tabs edit the same cell, last write wins.

## Category structure (updated 2026-04-13)

| Section | Sub-sections |
|---|---|
| Opening Bank Balance | — |
| Operating Inflows | AR (manual billed invoices), Other Cash Receipts, GST Refund, Confirmed Revenue (Revenue Tracker — auto-synced from confirmed pipeline projects) |
| Operating Outflows | Payroll, Contractors, PAYE, Rent, Insurance, GST Payment, Fixed Overheads, Credit Cards, Supplier Batch Payments (AP) → Third Party Supplier Costs (auto-synced from pipeline) |
| Loans & Financing | Paul Smith Loan, People's Choice, BNZ Loan, Loan OD & Interest Fees |

**AR** is for manually-entered billed invoices. **Revenue Tracker** auto-populates from confirmed pipeline projects — do not enter manual lines there. Non-confirmed pipeline stages (speculative, awaiting_approval, upcoming) do NOT appear in the forecast.

**Third Party Supplier Costs** auto-emits from each confirmed pipeline project's `third_party_costs` field, prorated across the same weeks as the revenue line. No manual entry needed.

## Pipeline entity scope

Only entities with `is_pipeline_entity = true` appear in the pipeline module. Currently enabled: AUG, CNR, BAL, DD, WRS. Disabled (hidden from pipeline but still used elsewhere): AGC, ENT. To toggle an entity: `update entities set is_pipeline_entity = ... where code = '...';`.

## Maintenance

- Add new weeks: they're pre-generated 52 weeks out. After a year, insert more periods in `forecast_periods`.
- Add entities: insert in `entities` table, assign to correct `entity_group`.
- Adjust OD limit: update `od_facility_limit` on the entity group.

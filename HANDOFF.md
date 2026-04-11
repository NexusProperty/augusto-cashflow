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

## Maintenance

- Add new weeks: they're pre-generated 52 weeks out. After a year, insert more periods in `forecast_periods`.
- Add entities: insert in `entities` table, assign to correct `entity_group`.
- Adjust OD limit: update `od_facility_limit` on the entity group.

# AI Document Processing Enhancement — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Augusto Cash Flow App — `app/api/documents/process/route.ts` + review UI

---

## Problem

The AI document processing pipeline extracts financial data (counterparty, amount, date) but returns vague hints for entity and category. It has no awareness of bank accounts, line statuses, forecast periods, or the full category list. The user must manually map every extraction to the correct entity, bank account, category, period, and status — 33 clicks per uploaded document.

## Solution

Context-injected AI prompt that feeds the actual database state (entities, bank accounts, categories, periods, statuses) to the AI. The AI returns resolved codes/IDs instead of fuzzy hints. Combined with auto-confirm for high-confidence items and bulk confirm for the rest.

---

## 1. Enhanced AI Prompt with Context Injection

### Reference Data Injection

Before calling the AI, query the database for:
- Active entities (id, name)
- Active bank accounts (id, name, account_number, entity_id)
- Leaf categories (id, name, code, flow_direction) — exclude section headers
- Forecast periods (id, week_ending) — next 18 weeks
- Valid line statuses with descriptions

Inject as structured reference data in the prompt preamble.

### Expanded AI Output Schema

Each extracted item returns:

```json
{
  "counterparty": "Client or supplier name",
  "amount": 12345.67,
  "expectedDate": "2026-04-10",
  "invoiceNumber": "INV-001",
  "entityCode": "cornerstore",
  "bankAccountNumber": "02-0108-0436551-000",
  "categoryCode": "outflows_ap",
  "suggestedStatus": "awaiting_payment",
  "suggestedWeekEnding": "2026-04-10",
  "statusReason": "Invoice raised but no payment confirmation in document",
  "paymentTerms": "60 days",
  "confidence": 0.95,
  "rawText": "Source text excerpt"
}
```

### Status Inference Rules (in prompt)

| Document Type | Default Status |
|---|---|
| Aged receivables | `awaiting_payment` |
| Aged payables | `awaiting_payment` |
| Bank statement (cleared transaction) | `paid` |
| Invoice (sent, not paid) | `awaiting_payment` |
| Invoice (not yet raised) | `tbc` |
| Loan repayment schedule | `confirmed` |
| Payroll (future run) | `confirmed` |
| Insurance premium | `confirmed` |
| Board paper / estimate | `speculative` |
| Budget request | `awaiting_budget_approval` |
| Remittance advice | `remittance_received` |

AI also returns `statusReason` — a short sentence explaining why it chose that status, shown as helper text in the review card.

---

## 2. Database Changes

### New columns on `document_extractions`

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `suggested_entity_id` | uuid FK → entities | YES | AI's best entity match |
| `suggested_bank_account_id` | uuid FK → bank_accounts | YES | AI's best bank account match |
| `suggested_category_id` | uuid FK → categories | YES | AI's best category match |
| `suggested_period_id` | uuid FK → forecast_periods | YES | AI's best period match |
| `suggested_status` | text | YES | AI's suggested line status |
| `status_reason` | text | YES | Why the AI picked that status |

### Server-Side Resolution (in API route, after AI responds)

1. `categoryCode: "outflows_ap"` → look up category UUID by `code` column
2. `bankAccountNumber: "02-0108-0436551-000"` → look up bank account UUID by `account_number`
3. `entityCode: "cornerstore"` → look up entity UUID by case-insensitive `name` match
4. `suggestedWeekEnding: "2026-04-10"` → find period with matching or closest `week_ending`
5. Store all resolved UUIDs in the `suggested_*` columns
6. If any lookup fails, leave that `suggested_*` column NULL (item goes to "Needs Attention")

### Fully Resolved Check

An extraction is "fully resolved" when ALL of these are non-null:
- `suggested_entity_id`
- `suggested_bank_account_id`
- `suggested_category_id`
- `suggested_period_id`
- `suggested_status`

---

## 3. Auto-Confirm & Bulk Confirm

### Tier 1: Auto-confirm (confidence >= 0.9 AND fully resolved)

- During processing, after inserting extractions, loop through items
- If confidence >= 0.9 AND all `suggested_*` fields resolved:
  - Create a `forecast_line` directly using the suggested values
  - Set `is_confirmed = true` and link `forecast_line_id`
  - Set `auto_confirmed = true` (new boolean column on `document_extractions`)
- These items skip "Pending Review" entirely

### Tier 2: Bulk confirm (fully resolved, confidence < 0.9)

- Items where all fields resolved but confidence < 0.9
- Appear in "Pending Review" section, pre-filled from `suggested_*` columns
- **"Confirm All (X items)"** button at the top confirms all visible items in one batch server action
- User can still expand individual cards to override before bulk confirming

### Tier 3: Manual review (incomplete resolution)

- Items where one or more `suggested_*` fields are NULL
- Appear in a separate **"Needs Attention"** section with count badge
- Unresolved dropdowns show blank, requiring manual selection

### New server action: `bulkConfirmExtractions`

```typescript
export async function bulkConfirmExtractions(extractionIds: string[])
```

- Fetches all extractions by ID
- Validates all have complete `suggested_*` fields
- Creates `forecast_lines` in batch
- Marks all as confirmed

### New server action: `undoAutoConfirm`

```typescript
export async function undoAutoConfirm(extractionId: string)
```

- Deletes the auto-created `forecast_line`
- Resets `is_confirmed` and `auto_confirmed` to false
- Item reappears in "Pending Review"

---

## 4. Review UI Layout

```
┌─ Upload Zone ─────────────────────────────┐
│  Drag & drop or browse                    │
├─ Auto-confirmed (N items) ────────────────┤  ← collapsed by default
│  [Expand] to see auto-placed items        │
│  Each item has "Undo" button              │
├─ Pending Review (N) ── [Confirm All] ─────┤  ← pre-filled, scan & go
│  ExtractionReviewCard (pre-filled)        │
│  ExtractionReviewCard (pre-filled)        │
├─ Needs Attention (N) ─────────────────────┤  ← red badge, manual fill
│  ExtractionReviewCard (partial fields)    │
├─ Recent Uploads ──────────────────────────┤
│  filename.xlsx   ready_for_review         │
└───────────────────────────────────────────┘
```

### Review card changes
- Initialize all dropdowns from `suggested_*` columns (no more client-side guessing)
- Show `status_reason` as muted helper text under the status dropdown
- Show confidence as a badge (green ≥ 80%, amber ≥ 50%, red < 50%)

---

## 5. Files Changed

| File | Change |
|---|---|
| `app/api/documents/process/route.ts` | Context injection, expanded prompt, resolution logic, auto-confirm |
| `lib/documents/extraction-schema.ts` | New fields in Zod schema |
| `components/documents/extraction-review-card.tsx` | Pre-fill from `suggested_*`, show status_reason |
| `components/documents/auto-confirmed-section.tsx` | NEW — collapsible list of auto-confirmed items with undo |
| `components/documents/bulk-confirm-bar.tsx` | NEW — "Confirm All" bar component |
| `app/(app)/documents/page.tsx` | Three-tier layout, fetch auto-confirmed items |
| `app/(app)/documents/actions.ts` | Add `bulkConfirmExtractions`, `undoAutoConfirm` actions |
| `supabase/migrations/015_*.sql` | New columns on document_extractions + auto_confirmed flag |

---

## 6. Non-Goals

- No automatic re-processing when DB reference data changes
- No learning from user corrections (future enhancement)
- No multi-document cross-referencing (e.g., matching invoice to bank statement)
- No real-time Xero/accounting system integration

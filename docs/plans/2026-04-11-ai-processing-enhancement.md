# AI Document Processing Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fuzzy AI extraction hints with context-injected, database-resolved outputs — auto-confirming high-confidence items and providing bulk confirm for the rest.

**Architecture:** Inject live reference data (entities, bank accounts, categories, periods, statuses) into the AI prompt so it returns resolved codes/IDs. Server-side resolution maps AI output to UUIDs. Three-tier review UI: auto-confirmed (collapsed), pending review (pre-filled), needs attention (manual).

**Tech Stack:** Next.js 15, Supabase (Postgres), Zod, OpenRouter (Claude), Vitest, React 19

**Spec:** `docs/specs/2026-04-11-ai-processing-enhancement-design.md`

**Working directory:** `clients/augusto-cashflow/`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/015_ai_processing_enhancement.sql` | Create | Add suggested_* columns + auto_confirmed flag to document_extractions |
| `lib/documents/extraction-schema.ts` | Modify | Expand Zod schema with new AI output fields |
| `lib/documents/reference-data.ts` | Create | Query + format reference data for AI prompt injection |
| `lib/documents/resolve-extraction.ts` | Create | Map AI codes/names → UUIDs, determine resolution completeness |
| `app/api/documents/process/route.ts` | Modify | Inject context, use expanded schema, resolve + auto-confirm |
| `app/(app)/documents/actions.ts` | Modify | Add bulkConfirmExtractions, undoAutoConfirm actions |
| `app/(app)/documents/page.tsx` | Modify | Three-tier layout with auto-confirmed section |
| `components/documents/extraction-review-card.tsx` | Modify | Pre-fill from suggested_* columns, show status_reason, confidence badge |
| `components/documents/auto-confirmed-section.tsx` | Create | Collapsible list of auto-confirmed items with undo |
| `components/documents/bulk-confirm-bar.tsx` | Create | "Confirm All (N items)" sticky bar |
| `tests/unit/resolve-extraction.test.ts` | Create | Resolution logic tests |
| `tests/unit/reference-data.test.ts` | Create | Reference data formatting tests |
| `tests/unit/bulk-confirm.test.ts` | Create | Bulk confirm + undo action tests |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/015_ai_processing_enhancement.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add AI suggestion columns to document_extractions
ALTER TABLE document_extractions
  ADD COLUMN IF NOT EXISTS suggested_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_period_id uuid REFERENCES forecast_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_status text,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS auto_confirmed boolean NOT NULL DEFAULT false;

-- Index for fetching auto-confirmed items by document
CREATE INDEX idx_document_extractions_auto_confirmed
  ON document_extractions(auto_confirmed) WHERE auto_confirmed = true;
```

- [ ] **Step 2: Apply migration locally**

Run from `clients/augusto-cashflow/`:
```bash
npx supabase db reset
```
Expected: Migration applies without errors. Existing document_extractions table gains 7 new columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_ai_processing_enhancement.sql
git commit -m "feat(documents): add AI suggestion columns + auto_confirmed flag"
```

---

### Task 2: Expanded Extraction Schema

**Files:**
- Modify: `lib/documents/extraction-schema.ts`
- Create: `tests/unit/extraction-schema.test.ts`

- [ ] **Step 1: Write failing test for the expanded schema**

Create `tests/unit/extraction-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ExtractionItem, ExtractionResult } from '@/lib/documents/extraction-schema'

describe('ExtractionItem', () => {
  it('accepts the expanded AI output format', () => {
    const item = {
      counterparty: 'Acme Corp',
      amount: 12345.67,
      expectedDate: '2026-04-10',
      invoiceNumber: 'INV-001',
      entityCode: 'cornerstore',
      bankAccountNumber: '02-0108-0436551-000',
      categoryCode: 'outflows_ap',
      suggestedStatus: 'awaiting_payment',
      suggestedWeekEnding: '2026-04-10',
      statusReason: 'Invoice raised but no payment confirmation in document',
      paymentTerms: '60 days',
      confidence: 0.95,
      rawText: 'Source text excerpt',
    }

    const result = ExtractionItem.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('accepts null optional fields', () => {
    const item = {
      counterparty: null,
      amount: null,
      expectedDate: null,
      invoiceNumber: null,
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedStatus: null,
      suggestedWeekEnding: null,
      statusReason: null,
      paymentTerms: null,
      confidence: 0.5,
      rawText: 'some text',
    }

    const result = ExtractionItem.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('rejects confidence outside 0-1 range', () => {
    const item = {
      counterparty: 'Test',
      amount: 100,
      expectedDate: null,
      invoiceNumber: null,
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedStatus: null,
      suggestedWeekEnding: null,
      statusReason: null,
      paymentTerms: null,
      confidence: 1.5,
      rawText: 'text',
    }

    const result = ExtractionItem.safeParse(item)
    expect(result.success).toBe(false)
  })
})

describe('ExtractionResult', () => {
  it('parses a full AI response', () => {
    const response = {
      classification: { documentType: 'aged_receivables', confidence: 0.9 },
      items: [{
        counterparty: 'Client A',
        amount: 5000,
        expectedDate: '2026-04-15',
        invoiceNumber: 'INV-100',
        entityCode: 'augusto',
        bankAccountNumber: '02-0108-0436455-000',
        categoryCode: 'inflows_ar',
        suggestedStatus: 'awaiting_payment',
        suggestedWeekEnding: '2026-04-17',
        statusReason: 'Outstanding invoice in aged receivables report',
        paymentTerms: '30 days',
        confidence: 0.92,
        rawText: 'Client A | INV-100 | $5,000 | 30 days',
      }],
    }

    const result = ExtractionResult.safeParse(response)
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/extraction-schema.test.ts
```
Expected: FAIL — `ExtractionItem` schema doesn't have the new fields (`entityCode`, `bankAccountNumber`, etc.).

- [ ] **Step 3: Update the schema**

Replace the entire contents of `lib/documents/extraction-schema.ts`:

```typescript
import { z } from 'zod'

export const DocumentClassification = z.object({
  documentType: z.enum([
    'aged_receivables', 'aged_payables', 'bank_statement', 'invoice',
    'loan_agreement', 'payroll_summary', 'contract', 'board_paper', 'other',
  ]),
  confidence: z.number().min(0).max(1),
})

export const ExtractionItem = z.object({
  counterparty: z.string().nullable(),
  amount: z.number().nullable(),
  expectedDate: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  entityCode: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  categoryCode: z.string().nullable(),
  suggestedStatus: z.string().nullable(),
  suggestedWeekEnding: z.string().nullable(),
  statusReason: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rawText: z.string(),
})

export const ExtractionResult = z.object({
  classification: DocumentClassification,
  items: z.array(ExtractionItem),
})

export type ExtractionItemType = z.infer<typeof ExtractionItem>
export type ExtractionResultType = z.infer<typeof ExtractionResult>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/extraction-schema.test.ts
```
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/documents/extraction-schema.ts tests/unit/extraction-schema.test.ts
git commit -m "feat(documents): expand extraction schema with resolved AI output fields"
```

---

### Task 3: Reference Data Query Module

**Files:**
- Create: `lib/documents/reference-data.ts`
- Create: `tests/unit/reference-data.test.ts`

- [ ] **Step 1: Write failing test for reference data formatting**

Create `tests/unit/reference-data.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatReferenceDataForPrompt } from '@/lib/documents/reference-data'

describe('formatReferenceDataForPrompt', () => {
  it('formats entities as a numbered list', () => {
    const entities = [
      { id: 'e1', name: 'Augusto' },
      { id: 'e2', name: 'Cornerstore' },
    ]
    const result = formatReferenceDataForPrompt({
      entities,
      bankAccounts: [],
      categories: [],
      periods: [],
    })

    expect(result).toContain('ENTITIES:')
    expect(result).toContain('- augusto')
    expect(result).toContain('- cornerstore')
  })

  it('formats bank accounts with entity and account number', () => {
    const bankAccounts = [
      { id: 'ba1', name: 'Augusto Current', account_number: '02-0108-0436455-000', entity_id: 'e1', entities: { name: 'Augusto' } },
    ]
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts,
      categories: [],
      periods: [],
    })

    expect(result).toContain('BANK ACCOUNTS:')
    expect(result).toContain('02-0108-0436455-000')
    expect(result).toContain('Augusto Current')
    expect(result).toContain('Augusto')
  })

  it('formats leaf categories with code and flow direction', () => {
    const categories = [
      { id: 'c1', name: 'Accounts Receivable', code: 'inflows_ar', flow_direction: 'inflow' },
      { id: 'c2', name: 'Accounts Payable', code: 'outflows_ap', flow_direction: 'outflow' },
    ]
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts: [],
      categories,
      periods: [],
    })

    expect(result).toContain('CATEGORIES:')
    expect(result).toContain('inflows_ar')
    expect(result).toContain('outflows_ap')
    expect(result).toContain('inflow')
  })

  it('formats periods as week ending dates', () => {
    const periods = [
      { id: 'p1', week_ending: '2026-04-10' },
      { id: 'p2', week_ending: '2026-04-17' },
    ]
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts: [],
      categories: [],
      periods,
    })

    expect(result).toContain('FORECAST PERIODS:')
    expect(result).toContain('2026-04-10')
    expect(result).toContain('2026-04-17')
  })

  it('returns empty sections gracefully for empty arrays', () => {
    const result = formatReferenceDataForPrompt({
      entities: [],
      bankAccounts: [],
      categories: [],
      periods: [],
    })

    expect(result).toContain('ENTITIES:')
    expect(result).toContain('BANK ACCOUNTS:')
    expect(result).toContain('CATEGORIES:')
    expect(result).toContain('FORECAST PERIODS:')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/reference-data.test.ts
```
Expected: FAIL — module `@/lib/documents/reference-data` does not exist.

- [ ] **Step 3: Implement reference data module**

Create `lib/documents/reference-data.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export interface ReferenceData {
  entities: { id: string; name: string }[]
  bankAccounts: { id: string; name: string; account_number: string | null; entity_id: string; entities: { name: string } | null }[]
  categories: { id: string; name: string; code: string; flow_direction: string }[]
  periods: { id: string; week_ending: string }[]
}

export async function fetchReferenceData(): Promise<ReferenceData> {
  const supabase = createAdminClient()

  const [
    { data: entities },
    { data: bankAccounts },
    { data: categories },
    { data: periods },
  ] = await Promise.all([
    supabase.from('entities').select('id, name').order('name'),
    supabase
      .from('bank_accounts')
      .select('id, name, account_number, entity_id, entities(name)')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, code, flow_direction')
      .not('flow_direction', 'in', '("balance","computed")')
      .not('code', 'in', '("inflows","outflows","loans","closing")')
      .order('sort_order'),
    supabase
      .from('forecast_periods')
      .select('id, week_ending')
      .gte('week_ending', new Date().toISOString().slice(0, 10))
      .order('week_ending')
      .limit(18),
  ])

  return {
    entities: entities ?? [],
    bankAccounts: (bankAccounts as ReferenceData['bankAccounts']) ?? [],
    categories: categories ?? [],
    periods: periods ?? [],
  }
}

export function formatReferenceDataForPrompt(data: ReferenceData): string {
  const sections: string[] = []

  sections.push('ENTITIES:')
  if (data.entities.length > 0) {
    data.entities.forEach(e => sections.push(`- ${e.name.toLowerCase()}`))
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('BANK ACCOUNTS:')
  if (data.bankAccounts.length > 0) {
    data.bankAccounts.forEach(ba => {
      const entity = ba.entities?.name ?? 'Unknown'
      sections.push(`- ${ba.account_number ?? 'no-number'} | ${ba.name} | Entity: ${entity}`)
    })
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('CATEGORIES (use the code value in categoryCode):')
  if (data.categories.length > 0) {
    data.categories.forEach(c => sections.push(`- ${c.code} | ${c.name} | ${c.flow_direction}`))
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('FORECAST PERIODS (use the date in suggestedWeekEnding):')
  if (data.periods.length > 0) {
    data.periods.forEach(p => sections.push(`- ${p.week_ending}`))
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('VALID LINE STATUSES (use in suggestedStatus):')
  sections.push('- confirmed — Payment/receipt confirmed')
  sections.push('- tbc — Expected but not yet invoiced')
  sections.push('- awaiting_payment — Invoice raised, payment pending')
  sections.push('- paid — Payment cleared')
  sections.push('- remittance_received — Remittance advice received')
  sections.push('- speculative — Estimate or board paper')
  sections.push('- awaiting_budget_approval — Budget request pending approval')

  return sections.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/reference-data.test.ts
```
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/documents/reference-data.ts tests/unit/reference-data.test.ts
git commit -m "feat(documents): reference data query + prompt formatting module"
```

---

### Task 4: Extraction Resolution Module

**Files:**
- Create: `lib/documents/resolve-extraction.ts`
- Create: `tests/unit/resolve-extraction.test.ts`

- [ ] **Step 1: Write failing tests for resolution logic**

Create `tests/unit/resolve-extraction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  resolveExtraction,
  isFullyResolved,
  type ResolvedExtraction,
} from '@/lib/documents/resolve-extraction'
import type { ReferenceData } from '@/lib/documents/reference-data'

const refData: ReferenceData = {
  entities: [
    { id: 'e1', name: 'Augusto' },
    { id: 'e2', name: 'Cornerstore' },
  ],
  bankAccounts: [
    { id: 'ba1', name: 'Augusto Current', account_number: '02-0108-0436455-000', entity_id: 'e1', entities: { name: 'Augusto' } },
    { id: 'ba2', name: 'Cornerstore Current', account_number: '02-0108-0436551-000', entity_id: 'e2', entities: { name: 'Cornerstore' } },
  ],
  categories: [
    { id: 'c1', name: 'Accounts Receivable', code: 'inflows_ar', flow_direction: 'inflow' },
    { id: 'c2', name: 'Accounts Payable', code: 'outflows_ap', flow_direction: 'outflow' },
  ],
  periods: [
    { id: 'p1', week_ending: '2026-04-10' },
    { id: 'p2', week_ending: '2026-04-17' },
    { id: 'p3', week_ending: '2026-04-24' },
  ],
}

describe('resolveExtraction', () => {
  it('resolves all fields when AI output matches reference data', () => {
    const result = resolveExtraction({
      entityCode: 'cornerstore',
      bankAccountNumber: '02-0108-0436551-000',
      categoryCode: 'outflows_ap',
      suggestedWeekEnding: '2026-04-17',
      suggestedStatus: 'awaiting_payment',
    }, refData)

    expect(result.entityId).toBe('e2')
    expect(result.bankAccountId).toBe('ba2')
    expect(result.categoryId).toBe('c2')
    expect(result.periodId).toBe('p2')
    expect(result.status).toBe('awaiting_payment')
  })

  it('matches entity name case-insensitively', () => {
    const result = resolveExtraction({
      entityCode: 'AUGUSTO',
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: null,
      suggestedStatus: null,
    }, refData)

    expect(result.entityId).toBe('e1')
  })

  it('returns null for unmatched fields', () => {
    const result = resolveExtraction({
      entityCode: 'nonexistent',
      bankAccountNumber: '99-9999-9999999-000',
      categoryCode: 'unknown_category',
      suggestedWeekEnding: '2099-01-01',
      suggestedStatus: 'awaiting_payment',
    }, refData)

    expect(result.entityId).toBeNull()
    expect(result.bankAccountId).toBeNull()
    expect(result.categoryId).toBeNull()
    expect(result.periodId).toBeNull()
    expect(result.status).toBe('awaiting_payment')
  })

  it('matches period to closest week ending when exact match absent', () => {
    const result = resolveExtraction({
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: '2026-04-12',
      suggestedStatus: null,
    }, refData)

    // 2026-04-12 falls in the week ending 2026-04-17
    expect(result.periodId).toBe('p2')
  })

  it('returns all nulls when AI fields are all null', () => {
    const result = resolveExtraction({
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: null,
      suggestedStatus: null,
    }, refData)

    expect(result.entityId).toBeNull()
    expect(result.bankAccountId).toBeNull()
    expect(result.categoryId).toBeNull()
    expect(result.periodId).toBeNull()
    expect(result.status).toBeNull()
  })

  it('rejects invalid status values', () => {
    const result = resolveExtraction({
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedWeekEnding: null,
      suggestedStatus: 'invalid_status',
    }, refData)

    expect(result.status).toBeNull()
  })
})

describe('isFullyResolved', () => {
  it('returns true when all fields are non-null', () => {
    const resolved: ResolvedExtraction = {
      entityId: 'e1',
      bankAccountId: 'ba1',
      categoryId: 'c1',
      periodId: 'p1',
      status: 'confirmed',
    }
    expect(isFullyResolved(resolved)).toBe(true)
  })

  it('returns false when any field is null', () => {
    const partial: ResolvedExtraction = {
      entityId: 'e1',
      bankAccountId: 'ba1',
      categoryId: null,
      periodId: 'p1',
      status: 'confirmed',
    }
    expect(isFullyResolved(partial)).toBe(false)
  })

  it('returns false when status is null', () => {
    const noStatus: ResolvedExtraction = {
      entityId: 'e1',
      bankAccountId: 'ba1',
      categoryId: 'c1',
      periodId: 'p1',
      status: null,
    }
    expect(isFullyResolved(noStatus)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/resolve-extraction.test.ts
```
Expected: FAIL — module `@/lib/documents/resolve-extraction` does not exist.

- [ ] **Step 3: Implement the resolution module**

Create `lib/documents/resolve-extraction.ts`:

```typescript
import type { ReferenceData } from './reference-data'

const VALID_STATUSES = new Set([
  'none', 'confirmed', 'tbc', 'awaiting_payment', 'paid',
  'remittance_received', 'speculative', 'awaiting_budget_approval',
])

export interface ResolvedExtraction {
  entityId: string | null
  bankAccountId: string | null
  categoryId: string | null
  periodId: string | null
  status: string | null
}

interface AIExtractionFields {
  entityCode: string | null
  bankAccountNumber: string | null
  categoryCode: string | null
  suggestedWeekEnding: string | null
  suggestedStatus: string | null
}

export function resolveExtraction(
  ai: AIExtractionFields,
  ref: ReferenceData,
): ResolvedExtraction {
  // Entity: case-insensitive name match
  const entityId = ai.entityCode
    ? ref.entities.find(e => e.name.toLowerCase() === ai.entityCode!.toLowerCase())?.id ?? null
    : null

  // Bank account: exact account number match
  const bankAccountId = ai.bankAccountNumber
    ? ref.bankAccounts.find(ba => ba.account_number === ai.bankAccountNumber)?.id ?? null
    : null

  // Category: exact code match
  const categoryId = ai.categoryCode
    ? ref.categories.find(c => c.code === ai.categoryCode)?.id ?? null
    : null

  // Period: find the week that contains the suggested date
  let periodId: string | null = null
  if (ai.suggestedWeekEnding && ref.periods.length > 0) {
    const target = new Date(ai.suggestedWeekEnding + 'T00:00:00')
    // Find the first period where week_ending >= target date
    const match = ref.periods.find(p => {
      const weekEnd = new Date(p.week_ending + 'T00:00:00')
      const weekStart = new Date(weekEnd)
      weekStart.setDate(weekStart.getDate() - 6)
      return target >= weekStart && target <= weekEnd
    })
    periodId = match?.id ?? null
  }

  // Status: validate against known values
  const status = ai.suggestedStatus && VALID_STATUSES.has(ai.suggestedStatus)
    ? ai.suggestedStatus
    : null

  return { entityId, bankAccountId, categoryId, periodId, status }
}

export function isFullyResolved(r: ResolvedExtraction): boolean {
  return r.entityId !== null
    && r.bankAccountId !== null
    && r.categoryId !== null
    && r.periodId !== null
    && r.status !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/resolve-extraction.test.ts
```
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/documents/resolve-extraction.ts tests/unit/resolve-extraction.test.ts
git commit -m "feat(documents): extraction resolution module — maps AI output to UUIDs"
```

---

### Task 5: Enhanced AI Prompt with Context Injection

**Files:**
- Modify: `app/api/documents/process/route.ts`

This task rewrites the `buildExtractionPrompt` function and the AI response handling to use context injection, the expanded schema, and server-side resolution.

- [ ] **Step 1: Write failing test for the new prompt builder**

Create `tests/unit/extraction-prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildContextPrompt } from '@/lib/documents/extraction-prompt'

describe('buildContextPrompt', () => {
  it('includes filename in the prompt', () => {
    const prompt = buildContextPrompt('test-invoice.pdf', 'ENTITIES:\n- augusto')
    expect(prompt).toContain('test-invoice.pdf')
  })

  it('includes reference data block', () => {
    const refBlock = 'ENTITIES:\n- augusto\n\nCATEGORIES:\n- inflows_ar'
    const prompt = buildContextPrompt('file.xlsx', refBlock)
    expect(prompt).toContain('ENTITIES:')
    expect(prompt).toContain('inflows_ar')
  })

  it('includes the expanded output schema fields', () => {
    const prompt = buildContextPrompt('file.pdf', '')
    expect(prompt).toContain('entityCode')
    expect(prompt).toContain('bankAccountNumber')
    expect(prompt).toContain('categoryCode')
    expect(prompt).toContain('suggestedStatus')
    expect(prompt).toContain('suggestedWeekEnding')
    expect(prompt).toContain('statusReason')
  })

  it('includes status inference rules', () => {
    const prompt = buildContextPrompt('file.pdf', '')
    expect(prompt).toContain('aged_receivables')
    expect(prompt).toContain('awaiting_payment')
    expect(prompt).toContain('bank_statement')
    expect(prompt).toContain('remittance_received')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/extraction-prompt.test.ts
```
Expected: FAIL — module `@/lib/documents/extraction-prompt` does not exist.

- [ ] **Step 3: Create the prompt builder module**

Create `lib/documents/extraction-prompt.ts`:

```typescript
export function buildContextPrompt(filename: string, referenceDataBlock: string): string {
  return `You are a financial document analyst for Augusto Group, a New Zealand creative/advertising agency group.

Analyze this document and extract ALL financially relevant items. The document filename is: ${filename}

## REFERENCE DATA — use these exact values in your response

${referenceDataBlock}

## STATUS INFERENCE RULES

Use these rules to determine suggestedStatus based on document type:
- aged_receivables → "awaiting_payment"
- aged_payables → "awaiting_payment"
- bank_statement (cleared transaction) → "paid"
- invoice (sent, not paid) → "awaiting_payment"
- invoice (not yet raised) → "tbc"
- loan_agreement (repayment schedule) → "confirmed"
- payroll_summary (future run) → "confirmed"
- Insurance premium → "confirmed"
- board_paper / estimate → "speculative"
- Budget request → "awaiting_budget_approval"
- remittance_received → "remittance_received"

## OUTPUT FORMAT

Respond with JSON in this exact format:
{
  "classification": {
    "documentType": "aged_receivables" | "aged_payables" | "bank_statement" | "invoice" | "loan_agreement" | "payroll_summary" | "contract" | "board_paper" | "other",
    "confidence": 0.0 to 1.0
  },
  "items": [
    {
      "counterparty": "Client or supplier name",
      "amount": 12345.67,
      "expectedDate": "2026-04-10",
      "invoiceNumber": "INV-001" or null,
      "entityCode": "cornerstore",
      "bankAccountNumber": "02-0108-0436551-000",
      "categoryCode": "outflows_ap",
      "suggestedStatus": "awaiting_payment",
      "suggestedWeekEnding": "2026-04-10",
      "statusReason": "Invoice raised but no payment confirmation in document",
      "paymentTerms": "60 days" or null,
      "confidence": 0.0 to 1.0,
      "rawText": "Source text excerpt this was extracted from"
    }
  ]
}

## RULES

- Extract EVERY line item with a dollar amount
- Amounts in NZD (convert if needed, note original currency in rawText)
- Positive amounts = money coming in (receivables, receipts)
- Negative amounts = money going out (payables, expenses)
- For aged debtor/creditor reports, extract each invoice as a separate item
- For bank statements, extract each transaction
- entityCode MUST be one of the entity names from ENTITIES above (lowercase). If unsure, use null.
- bankAccountNumber MUST be one of the account numbers from BANK ACCOUNTS above. If unsure, use null.
- categoryCode MUST be one of the codes from CATEGORIES above. If unsure, use null.
- suggestedWeekEnding MUST be one of the dates from FORECAST PERIODS above. Pick the week the payment is expected to land in. If unsure, use null.
- suggestedStatus MUST follow the STATUS INFERENCE RULES above. Always provide statusReason explaining your choice.
- Set confidence based on how certain you are about the FULL extraction (all fields).`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/extraction-prompt.test.ts
```
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/documents/extraction-prompt.ts tests/unit/extraction-prompt.test.ts
git commit -m "feat(documents): context-injected AI prompt builder with status inference rules"
```

---

### Task 6: Rewrite the API Route

**Files:**
- Modify: `app/api/documents/process/route.ts`

This task rewrites the POST handler to use context injection, Zod validation, server-side resolution, and auto-confirm.

- [ ] **Step 1: Rewrite the route handler**

Replace `app/api/documents/process/route.ts` with:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { parse as csvParse } from 'csv-parse/sync'
import mammoth from 'mammoth'
import { ExtractionResult } from '@/lib/documents/extraction-schema'
import { fetchReferenceData, formatReferenceDataForPrompt } from '@/lib/documents/reference-data'
import { buildContextPrompt } from '@/lib/documents/extraction-prompt'
import { resolveExtraction, isFullyResolved } from '@/lib/documents/resolve-extraction'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const AUTO_CONFIRM_THRESHOLD = 0.9

async function extractText(blob: Blob, mimeType: string): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer())

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimeType === 'application/vnd.ms-excel') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheets: string[] = []
    workbook.eachSheet((sheet) => {
      const rows: string[] = [`=== Sheet: ${sheet.name} ===`]
      sheet.eachRow((row, rowNumber) => {
        const values = (row.values as any[]).slice(1).map(v => {
          if (v === null || v === undefined) return ''
          if (typeof v === 'object' && v.result !== undefined) return String(v.result)
          if (typeof v === 'object' && v.text) return String(v.text)
          return String(v)
        })
        rows.push(`Row ${rowNumber}: ${values.join(' | ')}`)
      })
      sheets.push(rows.join('\n'))
    })
    return sheets.join('\n\n')
  }

  if (mimeType === 'text/csv') {
    const text = buffer.toString('utf-8')
    const records = csvParse(text, { relax_column_count: true })
    return records.map((row: string[], i: number) => `Row ${i + 1}: ${row.join(' | ')}`).join('\n')
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (mimeType === 'application/pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(buffer)
      return result.text
    } catch {
      return buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    }
  }

  return blob.text()
}

export async function POST(req: Request) {
  try {
    const { documentId } = await req.json()
    if (!documentId) return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
    if (!OPENROUTER_API_KEY) return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 })

    const supabase = createAdminClient()

    // Get document record
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Update status to parsing
    await supabase.from('documents').update({ status: 'parsing' }).eq('id', documentId)

    // Download file + fetch reference data in parallel
    const [fileResult, refData] = await Promise.all([
      supabase.storage.from('documents').download(doc.storage_path),
      fetchReferenceData(),
    ])

    if (fileResult.error || !fileResult.data) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Download failed' }).eq('id', documentId)
      return NextResponse.json({ error: 'Download failed' }, { status: 500 })
    }

    // Update status to extracting
    await supabase.from('documents').update({ status: 'extracting' }).eq('id', documentId)

    // Build context-injected prompt
    const refBlock = formatReferenceDataForPrompt(refData)
    const sanitizedName = sanitizeFilename(doc.filename)

    const isImage = doc.mime_type.startsWith('image/')
    let messages: any[]

    if (isImage) {
      const buffer = await fileResult.data.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: buildContextPrompt(sanitizedName, refBlock) },
          { type: 'image_url', image_url: { url: `data:${doc.mime_type};base64,${base64}` } },
        ],
      }]
    } else {
      const textContent = await extractText(fileResult.data, doc.mime_type)
      messages = [{
        role: 'user',
        content: buildContextPrompt(sanitizedName, refBlock) + '\n\n---\n\nDOCUMENT CONTENT:\n\n' + textContent.slice(0, 50000),
      }]
    }

    // Call Claude via OpenRouter
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      await supabase.from('documents').update({ status: 'failed', error_message: `AI error: ${errText.slice(0, 200)}` }).eq('id', documentId)
      return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 })
    }

    const aiResult = await aiResponse.json()
    const content = aiResult.choices?.[0]?.message?.content
    if (!content) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'No AI response' }).eq('id', documentId)
      return NextResponse.json({ error: 'No AI response' }, { status: 500 })
    }

    // Parse and validate with Zod
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Invalid JSON from AI' }).eq('id', documentId)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 500 })
    }

    const validated = ExtractionResult.safeParse(parsed)
    if (!validated.success) {
      await supabase.from('documents').update({ status: 'failed', error_message: `Schema validation: ${validated.error.message.slice(0, 200)}` }).eq('id', documentId)
      return NextResponse.json({ error: 'Schema validation failed' }, { status: 500 })
    }

    const { classification, items } = validated.data

    // Update doc type
    await supabase.from('documents').update({ doc_type: classification.documentType }).eq('id', documentId)

    // Resolve and insert extractions
    let autoConfirmedCount = 0

    if (items.length > 0) {
      const rows = items.map(item => {
        const resolved = resolveExtraction({
          entityCode: item.entityCode,
          bankAccountNumber: item.bankAccountNumber,
          categoryCode: item.categoryCode,
          suggestedWeekEnding: item.suggestedWeekEnding,
          suggestedStatus: item.suggestedStatus,
        }, refData)

        return {
          document_id: documentId,
          counterparty: item.counterparty,
          amount: item.amount,
          expected_date: item.expectedDate,
          invoice_number: item.invoiceNumber,
          entity_name: item.entityCode,
          category_name: item.categoryCode,
          payment_terms: item.paymentTerms,
          confidence: item.confidence,
          raw_text: item.rawText?.slice(0, 1000),
          suggested_entity_id: resolved.entityId,
          suggested_bank_account_id: resolved.bankAccountId,
          suggested_category_id: resolved.categoryId,
          suggested_period_id: resolved.periodId,
          suggested_status: resolved.status,
          status_reason: item.statusReason,
        }
      })

      const { data: insertedRows } = await supabase
        .from('document_extractions')
        .insert(rows)
        .select()

      // Auto-confirm high-confidence, fully-resolved items
      if (insertedRows) {
        for (const ext of insertedRows) {
          const resolved = {
            entityId: ext.suggested_entity_id,
            bankAccountId: ext.suggested_bank_account_id,
            categoryId: ext.suggested_category_id,
            periodId: ext.suggested_period_id,
            status: ext.suggested_status,
          }

          if (ext.confidence >= AUTO_CONFIRM_THRESHOLD && isFullyResolved(resolved)) {
            const { data: line } = await supabase
              .from('forecast_lines')
              .insert({
                entity_id: resolved.entityId!,
                category_id: resolved.categoryId!,
                period_id: resolved.periodId!,
                bank_account_id: resolved.bankAccountId!,
                amount: ext.amount ?? 0,
                confidence: Math.round(ext.confidence * 100),
                source: 'document',
                line_status: resolved.status!,
                source_document_id: documentId,
                counterparty: ext.counterparty,
                notes: ext.invoice_number ? `Invoice: ${ext.invoice_number}` : null,
              })
              .select()
              .single()

            if (line) {
              await supabase
                .from('document_extractions')
                .update({
                  is_confirmed: true,
                  auto_confirmed: true,
                  forecast_line_id: line.id,
                })
                .eq('id', ext.id)

              autoConfirmedCount++
            }
          }
        }
      }
    }

    // Mark as ready for review
    await supabase.from('documents').update({ status: 'ready_for_review' }).eq('id', documentId)

    return NextResponse.json({
      ok: true,
      extractionCount: items.length,
      autoConfirmedCount,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '').slice(0, 100)
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd clients/augusto-cashflow && npx tsc --noEmit app/api/documents/process/route.ts 2>&1 | head -20
```
Expected: No type errors (or only pre-existing type issues from database.types.ts).

- [ ] **Step 3: Commit**

```bash
git add app/api/documents/process/route.ts
git commit -m "feat(documents): rewrite API route with context injection, resolution, auto-confirm"
```

---

### Task 7: Bulk Confirm and Undo Server Actions

**Files:**
- Modify: `app/(app)/documents/actions.ts`
- Create: `tests/unit/bulk-confirm.test.ts`

- [ ] **Step 1: Write failing tests for the new actions**

Create `tests/unit/bulk-confirm.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase admin client
const mockFrom = vi.fn()
const mockUpdate = vi.fn()
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => ({ id: 'user-1' }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Chain builder for Supabase mock
function chainBuilder(data: any = null, error: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  }
  // Terminal calls that resolve
  chain.select.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  chain.update.mockReturnValue(chain)
  chain.delete.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.in.mockReturnValue({ data: data ? [data] : [], error })
  return chain
}

describe('bulkConfirmExtractions', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFrom.mockReset()
  })

  it('rejects empty extraction IDs array', async () => {
    const { bulkConfirmExtractions } = await import('@/app/(app)/documents/actions')
    const result = await bulkConfirmExtractions([])
    expect(result.error).toBe('No extraction IDs provided')
  })
})

describe('undoAutoConfirm', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFrom.mockReset()
  })

  it('rejects when extraction is not auto-confirmed', async () => {
    const extraction = {
      id: 'ext-1',
      auto_confirmed: false,
      forecast_line_id: null,
    }
    mockFrom.mockReturnValue(chainBuilder(extraction))

    const { undoAutoConfirm } = await import('@/app/(app)/documents/actions')
    const result = await undoAutoConfirm('ext-1')
    expect(result.error).toBe('Extraction was not auto-confirmed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/bulk-confirm.test.ts
```
Expected: FAIL — `bulkConfirmExtractions` and `undoAutoConfirm` not exported from actions.

- [ ] **Step 3: Add the new actions to the existing file**

Append to the end of `app/(app)/documents/actions.ts` (after the `dismissExtraction` function):

```typescript
export async function bulkConfirmExtractions(extractionIds: string[]) {
  const user = await requireAuth()
  if (extractionIds.length === 0) return { error: 'No extraction IDs provided' }

  const admin = createAdminClient()

  // Fetch all extractions
  const { data: extractions, error: fetchErr } = await admin
    .from('document_extractions')
    .select('*')
    .in('id', extractionIds)

  if (fetchErr || !extractions) return { error: 'Failed to fetch extractions' }

  // Validate all have complete suggestions
  const incomplete = extractions.filter(ext =>
    !ext.suggested_entity_id ||
    !ext.suggested_bank_account_id ||
    !ext.suggested_category_id ||
    !ext.suggested_period_id ||
    !ext.suggested_status
  )

  if (incomplete.length > 0) {
    return { error: `${incomplete.length} extraction(s) have incomplete field resolution` }
  }

  // Create forecast lines in batch
  const lineRows = extractions.map(ext => ({
    entity_id: ext.suggested_entity_id!,
    category_id: ext.suggested_category_id!,
    period_id: ext.suggested_period_id!,
    bank_account_id: ext.suggested_bank_account_id!,
    amount: ext.amount ?? 0,
    confidence: Math.round((ext.confidence ?? 0.5) * 100),
    source: 'document' as const,
    line_status: ext.suggested_status!,
    source_document_id: ext.document_id,
    counterparty: ext.counterparty,
    notes: ext.invoice_number ? `Invoice: ${ext.invoice_number}` : null,
    created_by: user.id,
  }))

  const { data: lines, error: lineErr } = await admin
    .from('forecast_lines')
    .insert(lineRows)
    .select()

  if (lineErr || !lines) return { error: 'Failed to create forecast lines' }

  // Mark extractions as confirmed
  for (let i = 0; i < extractions.length; i++) {
    await admin
      .from('document_extractions')
      .update({ is_confirmed: true, forecast_line_id: lines[i].id })
      .eq('id', extractions[i].id)
  }

  revalidatePath('/documents')
  revalidatePath('/forecast')
  return { data: { confirmedCount: lines.length } }
}

export async function undoAutoConfirm(extractionId: string) {
  await requireAuth()
  const admin = createAdminClient()

  const { data: extraction, error: fetchErr } = await admin
    .from('document_extractions')
    .select('*')
    .eq('id', extractionId)
    .single()

  if (fetchErr || !extraction) return { error: 'Extraction not found' }
  if (!extraction.auto_confirmed) return { error: 'Extraction was not auto-confirmed' }

  // Delete the auto-created forecast line
  if (extraction.forecast_line_id) {
    await admin
      .from('forecast_lines')
      .delete()
      .eq('id', extraction.forecast_line_id)
  }

  // Reset extraction state
  await admin
    .from('document_extractions')
    .update({
      is_confirmed: false,
      auto_confirmed: false,
      forecast_line_id: null,
    })
    .eq('id', extractionId)

  revalidatePath('/documents')
  revalidatePath('/forecast')
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/bulk-confirm.test.ts
```
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/documents/actions.ts tests/unit/bulk-confirm.test.ts
git commit -m "feat(documents): bulk confirm + undo auto-confirm server actions"
```

---

### Task 8: Auto-Confirmed Section Component

**Files:**
- Create: `components/documents/auto-confirmed-section.tsx`

- [ ] **Step 1: Create the component**

Create `components/documents/auto-confirmed-section.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { undoAutoConfirm } from '@/app/(app)/documents/actions'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface AutoConfirmedItem {
  id: string
  counterparty: string | null
  amount: number | null
  expected_date: string | null
  invoice_number: string | null
  confidence: number | null
  suggested_status: string | null
  status_reason: string | null
}

export function AutoConfirmedSection({ items }: { items: AutoConfirmedItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const visibleItems = items.filter(i => !undoneIds.has(i.id))
  if (visibleItems.length === 0) return null

  function handleUndo(id: string) {
    startTransition(async () => {
      const result = await undoAutoConfirm(id)
      if (result.ok) {
        setUndoneIds(prev => new Set([...prev, id]))
      }
    })
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-emerald-900">
            Auto-confirmed
          </h2>
          <Badge variant="success">{visibleItems.length}</Badge>
        </div>
        <span className="text-xs text-emerald-700">
          {expanded ? 'Collapse' : 'Expand to review'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {visibleItems.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border border-emerald-100 bg-white px-4 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {item.counterparty ?? 'Unknown'}
                  </p>
                  {item.suggested_status && (
                    <Badge variant="manual">{item.suggested_status.replace(/_/g, ' ')}</Badge>
                  )}
                </div>
                {item.status_reason && (
                  <p className="mt-0.5 text-xs text-zinc-500 italic">{item.status_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <p className={`text-sm font-bold whitespace-nowrap ${(item.amount ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {item.amount != null ? formatCurrency(item.amount) : '—'}
                </p>
                <button
                  onClick={() => handleUndo(item.id)}
                  disabled={isPending}
                  className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                >
                  Undo
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit components/documents/auto-confirmed-section.tsx 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add components/documents/auto-confirmed-section.tsx
git commit -m "feat(documents): auto-confirmed section component with undo"
```

---

### Task 9: Bulk Confirm Bar Component

**Files:**
- Create: `components/documents/bulk-confirm-bar.tsx`

- [ ] **Step 1: Create the component**

Create `components/documents/bulk-confirm-bar.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { bulkConfirmExtractions } from '@/app/(app)/documents/actions'

export function BulkConfirmBar({ extractionIds }: { extractionIds: string[] }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ confirmedCount?: number; error?: string } | null>(null)

  if (extractionIds.length === 0) return null

  function handleBulkConfirm() {
    setResult(null)
    startTransition(async () => {
      const res = await bulkConfirmExtractions(extractionIds)
      if (res.error) {
        setResult({ error: res.error })
      } else {
        setResult({ confirmedCount: res.data?.confirmedCount })
      }
    })
  }

  if (result?.confirmedCount) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-medium text-emerald-800">
          {result.confirmedCount} item(s) confirmed and added to forecast.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
      <p className="text-sm font-medium text-indigo-900">
        {extractionIds.length} item(s) pre-filled and ready to confirm
      </p>
      <div className="flex items-center gap-2">
        {result?.error && (
          <p className="text-xs text-red-600">{result.error}</p>
        )}
        <button
          onClick={handleBulkConfirm}
          disabled={isPending}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {isPending ? 'Confirming...' : `Confirm All (${extractionIds.length})`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit components/documents/bulk-confirm-bar.tsx 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add components/documents/bulk-confirm-bar.tsx
git commit -m "feat(documents): bulk confirm bar component"
```

---

### Task 10: Update Extraction Review Card

**Files:**
- Modify: `components/documents/extraction-review-card.tsx`

The review card must now pre-fill from `suggested_*` columns instead of client-side guessing, show `status_reason`, and display the confidence badge on all cards (not just expanded).

- [ ] **Step 1: Update the Extraction interface and pre-fill logic**

In `components/documents/extraction-review-card.tsx`, replace the `Extraction` interface and the state initialization block.

Replace the `Extraction` interface (lines 34-45):

```typescript
interface Extraction {
  id: string
  counterparty: string | null
  amount: number | null
  expected_date: string | null
  entity_name: string | null
  category_name: string | null
  invoice_number: string | null
  confidence: number | null
  raw_text: string | null
  documents: { filename: string } | null
  suggested_entity_id: string | null
  suggested_bank_account_id: string | null
  suggested_category_id: string | null
  suggested_period_id: string | null
  suggested_status: string | null
  status_reason: string | null
}
```

Replace the client-side matching block (lines 66-98 — from `// Auto-match entity` through `matchedBankAccount`) and the state initialization (lines 100-105) with:

```typescript
  // Pre-fill from server-resolved suggested_* columns
  const [entityId, setEntityId] = useState(extraction.suggested_entity_id ?? '')
  const [categoryId, setCategoryId] = useState(extraction.suggested_category_id ?? '')
  const [periodId, setPeriodId] = useState(extraction.suggested_period_id ?? '')
  const [bankAccountId, setBankAccountId] = useState(extraction.suggested_bank_account_id ?? '')
  const [amount, setAmount] = useState(extraction.amount?.toString() ?? '')
  const [lineStatus, setLineStatus] = useState<string>(extraction.suggested_status ?? 'none')
```

This eliminates all the `matchedEntity`, `matchedCategory`, `matchedPeriod`, `matchedBankAccount` client-side guessing logic. The server now resolves these.

- [ ] **Step 2: Add status_reason display below the status dropdown**

In the expanded section, after the status `<select>` closing `</div>` (around line 230), add:

```tsx
          {extraction.status_reason && (
            <p className="mt-1 text-xs text-zinc-500 italic">{extraction.status_reason}</p>
          )}
```

- [ ] **Step 3: Verify no type errors**

```bash
npx tsc --noEmit components/documents/extraction-review-card.tsx 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
git add components/documents/extraction-review-card.tsx
git commit -m "feat(documents): pre-fill review card from suggested columns + show status_reason"
```

---

### Task 11: Three-Tier Document Page Layout

**Files:**
- Modify: `app/(app)/documents/page.tsx`

- [ ] **Step 1: Rewrite the page with three-tier layout**

Replace `app/(app)/documents/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server'
import { UploadZone } from '@/components/documents/upload-zone'
import { ExtractionReviewCard } from '@/components/documents/extraction-review-card'
import { AutoConfirmedSection } from '@/components/documents/auto-confirmed-section'
import { BulkConfirmBar } from '@/components/documents/bulk-confirm-bar'
import { Badge } from '@/components/ui/badge'

export default async function DocumentsPage() {
  const supabase = await createClient()

  const [
    { data: documents },
    { data: pendingExtractions },
    { data: autoConfirmedExtractions },
    { data: entities },
    { data: categories },
    { data: periods },
    { data: bankAccounts },
  ] = await Promise.all([
    supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(50),
    supabase
      .from('document_extractions')
      .select('*, documents(filename)')
      .eq('is_confirmed', false)
      .eq('is_dismissed', false)
      .eq('auto_confirmed', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('document_extractions')
      .select('id, counterparty, amount, expected_date, invoice_number, confidence, suggested_status, status_reason')
      .eq('auto_confirmed', true)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('entities').select('id, name').order('name'),
    supabase.from('categories').select('id, name, code, flow_direction').order('sort_order'),
    supabase.from('forecast_periods').select('id, week_ending').order('week_ending'),
    supabase
      .from('bank_accounts')
      .select('id, name, entity_id, account_number, account_type, entities(name)')
      .eq('is_active', true)
      .order('name'),
  ])

  // Split pending into fully-resolved (bulk confirmable) vs needs-attention
  const fullyResolved = (pendingExtractions ?? []).filter((ext: any) =>
    ext.suggested_entity_id &&
    ext.suggested_bank_account_id &&
    ext.suggested_category_id &&
    ext.suggested_period_id &&
    ext.suggested_status
  )
  const needsAttention = (pendingExtractions ?? []).filter((ext: any) =>
    !ext.suggested_entity_id ||
    !ext.suggested_bank_account_id ||
    !ext.suggested_category_id ||
    !ext.suggested_period_id ||
    !ext.suggested_status
  )

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>

      <UploadZone />

      {/* Tier 1: Auto-confirmed (collapsed) */}
      <AutoConfirmedSection items={autoConfirmedExtractions ?? []} />

      {/* Tier 2: Pending Review — fully resolved, bulk confirmable */}
      {fullyResolved.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">
            Pending Review
            <Badge variant="warning" className="ml-2">{fullyResolved.length}</Badge>
          </h2>
          <BulkConfirmBar extractionIds={fullyResolved.map((e: any) => e.id)} />
          <div className="mt-2 space-y-2">
            {fullyResolved.map((ext: any) => (
              <ExtractionReviewCard
                key={ext.id}
                extraction={ext}
                entities={entities ?? []}
                categories={categories ?? []}
                periods={periods ?? []}
                bankAccounts={bankAccounts ?? []}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tier 3: Needs Attention — incomplete resolution */}
      {needsAttention.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">
            Needs Attention
            <Badge variant="danger" className="ml-2">{needsAttention.length}</Badge>
          </h2>
          <div className="space-y-2">
            {needsAttention.map((ext: any) => (
              <ExtractionReviewCard
                key={ext.id}
                extraction={ext}
                entities={entities ?? []}
                categories={categories ?? []}
                periods={periods ?? []}
                bankAccounts={bankAccounts ?? []}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Uploads */}
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Recent Uploads</h2>
        <div className="space-y-2">
          {(documents ?? []).map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium">{doc.filename}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(doc.created_at).toLocaleDateString('en-NZ')} · {Math.round(doc.file_size / 1024)}KB
                  </p>
                </div>
              </div>
              <Badge variant={
                doc.status === 'confirmed' ? 'success' :
                doc.status === 'failed' ? 'danger' :
                doc.status === 'ready_for_review' ? 'warning' : 'manual'
              }>
                {doc.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page compiles**

```bash
npx tsc --noEmit app/(app)/documents/page.tsx 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add app/(app)/documents/page.tsx
git commit -m "feat(documents): three-tier review layout — auto-confirmed, pending, needs attention"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: All tests pass (existing + new).

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: No new type errors introduced.

- [ ] **Step 3: Start dev server and test the UI**

```bash
npm run dev
```

Open `http://localhost:3000/documents` and verify:
1. Upload a document — processing completes
2. Auto-confirmed section appears (collapsed) for high-confidence items
3. Pending Review section shows pre-filled cards with "Confirm All" bar
4. Needs Attention section shows cards with empty dropdowns for unresolved fields
5. Undo button on auto-confirmed items works
6. Bulk confirm works
7. Individual confirm on needs-attention items works

- [ ] **Step 4: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "fix(documents): address issues found during manual testing"
```

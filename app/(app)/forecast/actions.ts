'use server'

import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { UpdateLineAmountsSchema, AMOUNT_MIN, AMOUNT_MAX } from './schemas'
import {
  assertEntityInScope,
  assertForecastLinesInScope,
} from '@/lib/auth/scope'
import type { Json } from '@/lib/database.types'
import type { ForecastLine } from '@/lib/types'

function revalidateForecast() {
  revalidatePath('/forecast')
  revalidatePath('/forecast/detail')
  revalidatePath('/forecast/compare')
  revalidatePath('/forecast/overrides')
  revalidatePath('/forecast/coachmate') // reads forecast_lines via loadForecastData
  // Excluded: /forecast/intercompany — reads intercompany_balances, not forecast_lines
}

const LINE_STATUSES = [
  'none',
  'confirmed',
  'tbc',
  'awaiting_payment',
  'paid',
  'remittance_received',
  'speculative',
  'awaiting_budget_approval',
] as const

const BulkUpdateStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(LINE_STATUSES),
})

const BulkAddLineRowSchema = z.object({
  entityId: z.string().uuid(),
  categoryId: z.string().uuid(),
  periodId: z.string().uuid(),
  amount: z.coerce.number().min(AMOUNT_MIN).max(AMOUNT_MAX),
  confidence: z.coerce.number().int().min(0).max(100).optional(),
  counterparty: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lineStatus: z.enum(LINE_STATUSES).optional(),
  source: z.enum(['manual', 'document', 'recurring', 'pipeline']).optional(),
})

const BulkAddLinesSchema = z.array(BulkAddLineRowSchema).min(1).max(500)

const AddLineSchema = z.object({
  entityId: z.string().uuid(),
  categoryId: z.string().uuid(),
  periodId: z.string().uuid(),
  amount: z.coerce.number().min(AMOUNT_MIN).max(AMOUNT_MAX),
  confidence: z.coerce.number().int().min(0).max(100).default(100),
  counterparty: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
})

export async function addForecastLine(formData: FormData) {
  const user = await requireAuth()
  const parsed = AddLineSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.message }

  if (!(await assertEntityInScope(parsed.data.entityId))) {
    return { error: 'Entity not in your scope' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_lines')
    .insert({
      entity_id: parsed.data.entityId,
      category_id: parsed.data.categoryId,
      period_id: parsed.data.periodId,
      amount: parsed.data.amount,
      confidence: parsed.data.confidence,
      source: parsed.data.confidence < 100 ? 'pipeline' : 'manual',
      counterparty: parsed.data.counterparty ?? null,
      notes: parsed.data.notes ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: 'Failed to add line' }
  revalidateForecast()
  return { data }
}

const UpdateAmountSchema = z.object({
  lineId: z.string().uuid(),
  amount: z.coerce.number().min(AMOUNT_MIN).max(AMOUNT_MAX),
})

export async function updateLineAmount(formData: FormData) {
  await requireAuth()
  const parsed = UpdateAmountSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.message }

  const { inScope, outOfScope } = await assertForecastLinesInScope([parsed.data.lineId])
  if (outOfScope.length > 0 || inScope.length === 0) {
    return { error: 'Line not in your scope' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('forecast_lines')
    .update({ amount: parsed.data.amount, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.lineId)

  if (error) return { error: 'Failed to update' }
  revalidateForecast()
  return { ok: true }
}

export async function deleteForecastLine(lineId: string) {
  await requireAuth()
  const parsed = z.string().uuid().safeParse(lineId)
  if (!parsed.success) return { error: 'Invalid id' }

  const { inScope } = await assertForecastLinesInScope([parsed.data])
  if (inScope.length === 0) return { error: 'Line not in your scope' }

  const supabase = await createClient()
  const { error } = await supabase.from('forecast_lines').delete().eq('id', parsed.data)
  if (error) return { error: 'Failed to delete' }
  revalidateForecast()
  return { ok: true }
}

export async function updateLineAmounts(
  payload: { updates: Array<{ id: string; amount: number; formula?: string | null }> },
): Promise<
  | { ok: true; count: number; skippedOutOfScope?: number }
  | { error: string; failedIds?: string[]; outOfScopeIds?: string[] }
> {
  await requireAuth()
  const parsed = UpdateLineAmountsSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  // Batch scope check (single query)
  const allIds = parsed.data.updates.map((u) => u.id)
  const { inScope, outOfScope } = await assertForecastLinesInScope(allIds)
  const inScopeSet = new Set(inScope)
  const allowed = parsed.data.updates.filter((u) => inScopeSet.has(u.id))

  if (allowed.length === 0) {
    return { error: 'No updates in your scope', outOfScopeIds: outOfScope }
  }

  const supabase = await createClient()

  // Split into two groups:
  //   pureAmounts — no formula field set (or formula undefined) → fast RPC batch
  //   withFormula — formula field is present (even null to clear) → direct table update
  const pureAmounts = allowed.filter((u) => u.formula === undefined)
  const withFormula = allowed.filter((u) => u.formula !== undefined)

  // Fast path: pure amount updates via atomic RPC
  if (pureAmounts.length > 0) {
    const { error } = await supabase.rpc('update_forecast_line_amounts', {
      p_updates: pureAmounts as unknown as Json,
    })
    if (error) {
      return {
        error: 'Batch update failed',
        failedIds: pureAmounts.map((u) => u.id),
        outOfScopeIds: outOfScope,
      }
    }
  }

  // Formula path: direct table updates (formula-bearing rows are rare)
  // Each update is individual; we collect failures and return the first error.
  //
  // ATOMICITY GAP: If pureAmounts.length > 0, those rows were already committed
  // by the RPC above. If a per-row formula update fails here, the DB has a mix
  // of new amounts (from the RPC) and the failed row still at its old amount.
  // The grid's optimistic revert will visually show pre-edit amounts for ALL
  // rows, creating a temporary split-brain until the next reload.
  //
  // TODO: Extend update_forecast_line_amounts RPC to accept an optional formula
  // column per row so the entire batch (amounts + formulas) is committed
  // atomically. Tracked in follow-up work.
  if (withFormula.length > 0) {
    for (const u of withFormula) {
      const { error } = await supabase
        .from('forecast_lines')
        .update({ amount: u.amount, formula: u.formula ?? null, updated_at: new Date().toISOString() })
        .eq('id', u.id)
      if (error) {
        return {
          error: 'Formula update failed',
          failedIds: [u.id],
          outOfScopeIds: outOfScope,
        }
      }
    }
  }

  revalidateForecast()
  return {
    ok: true,
    count: allowed.length,
    ...(outOfScope.length > 0 ? { skippedOutOfScope: outOfScope.length } : {}),
  }
}

/**
 * Batch-update `line_status` across many forecast lines in a single RLS-aware
 * query. Used by the grid's multi-cell "Set status" action. Out-of-scope ids
 * are filtered (not errored) so a selection spanning a mix of scopes still
 * updates the ones the user owns.
 */
export async function bulkUpdateLineStatus(
  payload: { ids: string[]; status: string },
): Promise<
  | { ok: true; count: number; skippedOutOfScope?: number }
  | { error: string }
> {
  await requireAuth()
  const parsed = BulkUpdateStatusSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const { inScope, outOfScope } = await assertForecastLinesInScope(parsed.data.ids)
  if (inScope.length === 0) {
    return { error: 'No lines in your scope' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('forecast_lines')
    .update({ line_status: parsed.data.status, updated_at: new Date().toISOString() })
    .in('id', inScope)

  if (error) return { error: 'Failed to update status' }
  revalidateForecast()
  return {
    ok: true,
    count: inScope.length,
    ...(outOfScope.length > 0 ? { skippedOutOfScope: outOfScope.length } : {}),
  }
}

export async function bulkAddForecastLines(
  rows: Array<{
    entityId: string
    categoryId: string
    periodId: string
    amount: number
    confidence?: number
    counterparty?: string | null
    notes?: string | null
    lineStatus?: string
    source?: string
  }>,
): Promise<{ ok: true; data: ForecastLine[] } | { error: string }> {
  const user = await requireAuth()
  const parsed = BulkAddLinesSchema.safeParse(rows)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const uniqueEntityIds = [...new Set(parsed.data.map((r) => r.entityId))]
  for (const entityId of uniqueEntityIds) {
    if (!(await assertEntityInScope(entityId))) {
      return { error: `Entity not in your scope: ${entityId}` }
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forecast_lines')
    .insert(
      parsed.data.map((r) => ({
        entity_id: r.entityId,
        category_id: r.categoryId,
        period_id: r.periodId,
        amount: r.amount,
        confidence: r.confidence ?? 100,
        source: r.source ?? (((r.confidence ?? 100) < 100) ? 'pipeline' : 'manual'),
        counterparty: r.counterparty ?? null,
        notes: r.notes ?? null,
        line_status: r.lineStatus ?? 'confirmed',
        created_by: user.id,
      })),
    )
    .select()

  if (error) return { error: 'Failed to add lines' }
  revalidateForecast()

  const result: ForecastLine[] = (data ?? []).map((raw) => ({
    id: String(raw.id),
    entityId: String(raw.entity_id),
    categoryId: String(raw.category_id),
    periodId: String(raw.period_id),
    amount: Number(raw.amount) || 0,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 100,
    source: (raw.source as ForecastLine['source']) ?? 'manual',
    counterparty: (raw.counterparty as string | null) ?? null,
    notes: (raw.notes as string | null) ?? null,
    sourceDocumentId: (raw.source_document_id as string | null) ?? null,
    sourceRuleId: (raw.source_rule_id as string | null) ?? null,
    sourcePipelineProjectId: (raw.source_pipeline_project_id as string | null) ?? null,
    lineStatus: (raw.line_status as ForecastLine['lineStatus']) ?? 'confirmed',
    formula: (raw.formula as string | null) ?? null,
  }))

  return { ok: true, data: result }
}

// --- Per-bank opening balances (migration 024) -------------------------------

const UpdateBankOpeningBalanceSchema = z.object({
  bankAccountId: z.string().uuid(),
  openingBalance: z.number().finite().min(-100_000_000).max(100_000_000),
})

export async function updateBankOpeningBalance(input: unknown) {
  await requireAuth()
  const parsed = UpdateBankOpeningBalanceSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('bank_accounts')
    .update({ opening_balance: parsed.data.openingBalance })
    .eq('id', parsed.data.bankAccountId)
    .eq('is_active', true)

  if (error) {
    return { error: 'Update failed' }
  }

  revalidateForecast()
  return { ok: true }
}

// --- Group OD facility limit (editable on /forecast/detail Available Cash row) ---

const UpdateGroupOdFacilityLimitSchema = z.object({
  groupId: z.string().uuid(),
  odFacilityLimit: z.number().finite().min(0).max(1_000_000_000),
})

export async function updateGroupOdFacilityLimit(input: unknown) {
  await requireAuth()
  const parsed = UpdateGroupOdFacilityLimitSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('entity_groups')
    .update({ od_facility_limit: parsed.data.odFacilityLimit })
    .eq('id', parsed.data.groupId)

  if (error) {
    return { error: 'Update failed' }
  }

  revalidateForecast()
  return { ok: true }
}

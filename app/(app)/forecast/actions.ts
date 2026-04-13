'use server'

import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { UpdateLineAmountsSchema } from './schemas'
import {
  assertEntityInScope,
  assertForecastLinesInScope,
} from '@/lib/auth/scope'

const AMOUNT_MIN = -1_000_000_000
const AMOUNT_MAX = 1_000_000_000

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
  return { ok: true }
}

export async function updateLineAmounts(
  payload: { updates: Array<{ id: string; amount: number }> },
): Promise<
  | { ok: true; count: number; skippedOutOfScope?: number }
  | { error: string; failedIds?: string[]; outOfScopeIds?: string[] }
> {
  await requireAuth()
  const parsed = UpdateLineAmountsSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  // Bounds check on amounts (schema enforces structure; explicit bounds here)
  for (const u of parsed.data.updates) {
    if (u.amount < AMOUNT_MIN || u.amount > AMOUNT_MAX) {
      return { error: `Amount out of range for ${u.id}` }
    }
  }

  // Batch scope check (single query)
  const allIds = parsed.data.updates.map((u) => u.id)
  const { inScope, outOfScope } = await assertForecastLinesInScope(allIds)
  const inScopeSet = new Set(inScope)
  const allowed = parsed.data.updates.filter((u) => inScopeSet.has(u.id))

  if (allowed.length === 0) {
    return { error: 'No updates in your scope', outOfScopeIds: outOfScope }
  }

  const supabase = await createClient()
  // Atomic batched update via RPC — either every row updates or none do.
  // Replaces the per-row loop which could leave partial state on failure.
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: unknown,
  ) => Promise<{ error: { message: string } | null }>
  const { error } = await rpc('update_forecast_line_amounts', { p_updates: allowed })
  if (error) {
    return {
      error: 'Batch update failed',
      failedIds: allowed.map((u) => u.id),
      outOfScopeIds: outOfScope,
    }
  }
  return {
    ok: true,
    count: allowed.length,
    ...(outOfScope.length > 0 ? { skippedOutOfScope: outOfScope.length } : {}),
  }
}

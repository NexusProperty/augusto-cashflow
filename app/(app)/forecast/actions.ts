'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { UpdateLineAmountsSchema } from './schemas'

const AddLineSchema = z.object({
  entityId: z.string().uuid(),
  categoryId: z.string().uuid(),
  periodId: z.string().uuid(),
  amount: z.coerce.number(),
  confidence: z.coerce.number().int().min(0).max(100).default(100),
  counterparty: z.string().optional(),
  notes: z.string().optional(),
})

export async function addForecastLine(formData: FormData) {
  const user = await requireAuth()
  const parsed = AddLineSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.message }

  const admin = createAdminClient()
  const { data, error } = await admin
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
  amount: z.coerce.number(),
})

export async function updateLineAmount(formData: FormData) {
  await requireAuth()
  const parsed = UpdateAmountSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.message }

  const admin = createAdminClient()
  const { error } = await admin
    .from('forecast_lines')
    .update({ amount: parsed.data.amount, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.lineId)

  if (error) return { error: 'Failed to update' }
  return { ok: true }
}

export async function deleteForecastLine(lineId: string) {
  await requireAuth()
  const admin = createAdminClient()
  const { error } = await admin.from('forecast_lines').delete().eq('id', lineId)
  if (error) return { error: 'Failed to delete' }
  return { ok: true }
}

export async function updateLineAmounts(
  payload: { updates: Array<{ id: string; amount: number }> }
): Promise<{ ok: true; count: number } | { error: string; failedIds?: string[] }> {
  await requireAuth()
  const parsed = UpdateLineAmountsSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const admin = createAdminClient()
  const failedIds: string[] = []
  // Sequential updates inside a loop; acceptable for <500 rows
  for (const u of parsed.data.updates) {
    const { error } = await admin
      .from('forecast_lines')
      .update({ amount: u.amount, updated_at: new Date().toISOString() })
      .eq('id', u.id)
    if (error) failedIds.push(u.id)
  }
  if (failedIds.length > 0) return { error: 'Some updates failed', failedIds }
  return { ok: true, count: parsed.data.updates.length }
}


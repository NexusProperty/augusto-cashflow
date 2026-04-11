'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const RecurringRuleSchema = z.object({
  entityId: z.string().uuid(),
  categoryId: z.string().uuid(),
  description: z.string().min(1),
  amount: z.coerce.number(),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly']),
  anchorDate: z.string(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
  endDate: z.string().optional(),
  counterparty: z.string().optional(),
})

export async function createRecurringRule(formData: FormData) {
  const user = await requireAuth()
  const parsed = RecurringRuleSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.message }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('recurring_rules')
    .insert({
      entity_id: parsed.data.entityId,
      category_id: parsed.data.categoryId,
      description: parsed.data.description,
      amount: parsed.data.amount,
      frequency: parsed.data.frequency,
      anchor_date: parsed.data.anchorDate,
      day_of_month: parsed.data.dayOfMonth ?? null,
      end_date: parsed.data.endDate || null,
      counterparty: parsed.data.counterparty || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: 'Failed to create rule' }
  revalidatePath('/settings/recurring')
  revalidatePath('/forecast')
  return { data }
}

export async function deleteRecurringRule(ruleId: string) {
  await requireAuth()
  const admin = createAdminClient()
  const { error } = await admin.from('recurring_rules').delete().eq('id', ruleId)
  if (error) return { error: 'Failed to delete' }
  revalidatePath('/settings/recurring')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function toggleRuleActive(ruleId: string, isActive: boolean) {
  await requireAuth()
  const admin = createAdminClient()
  await admin.from('recurring_rules').update({ is_active: isActive }).eq('id', ruleId)
  revalidatePath('/settings/recurring')
  revalidatePath('/forecast')
  return { ok: true }
}

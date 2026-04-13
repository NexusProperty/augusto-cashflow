'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const TargetType = z.enum(['pipeline_item', 'recurring_rule'])

const BaseFields = {
  scenarioId: z.string().uuid(),
  targetType: TargetType,
  targetId: z.string().uuid(),
  overrideConfidence: z
    .preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(100).nullable())
    .default(null),
  overrideAmount: z
    .preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().nullable())
    .default(null),
  overrideWeekShift: z
    .preprocess((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)), z.number().int())
    .default(0),
  isExcluded: z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()).default(false),
}

const CreateSchema = z.object(BaseFields)
const UpdateSchema = z.object({ id: z.string().uuid(), ...BaseFields })

function rowFromParsed(p: z.infer<typeof CreateSchema>) {
  return {
    scenario_id: p.scenarioId,
    target_type: p.targetType,
    target_id: p.targetId,
    override_confidence: p.overrideConfidence,
    override_amount: p.overrideAmount,
    override_week_shift: p.overrideWeekShift,
    is_excluded: p.isExcluded,
  }
}

export async function createScenarioOverride(formData: FormData) {
  await requireAuth()
  const parsed = CreateSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const admin = createAdminClient()
  const { error } = await admin.from('scenario_overrides').insert(rowFromParsed(parsed.data))
  if (error) return { error: 'Failed to create override' }

  revalidatePath('/forecast/overrides')
  revalidatePath('/forecast')
  revalidatePath('/forecast/detail')
  revalidatePath('/forecast/compare')
  return { ok: true }
}

export async function updateScenarioOverride(formData: FormData) {
  await requireAuth()
  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('scenario_overrides')
    .update(rowFromParsed(parsed.data))
    .eq('id', parsed.data.id)
  if (error) return { error: 'Failed to update override' }

  revalidatePath('/forecast/overrides')
  revalidatePath('/forecast')
  revalidatePath('/forecast/detail')
  revalidatePath('/forecast/compare')
  return { ok: true }
}

export async function deleteScenarioOverride(id: string) {
  await requireAuth()
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { error: 'Invalid id' }

  const admin = createAdminClient()
  const { error } = await admin.from('scenario_overrides').delete().eq('id', parsed.data)
  if (error) return { error: 'Failed to delete override' }

  revalidatePath('/forecast/overrides')
  revalidatePath('/forecast')
  revalidatePath('/forecast/detail')
  revalidatePath('/forecast/compare')
  return { ok: true }
}

// Exported for unit tests
export const __test__ = { CreateSchema, UpdateSchema, rowFromParsed }

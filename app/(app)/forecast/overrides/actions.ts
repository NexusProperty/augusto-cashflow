'use server'

import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  CreateScenarioOverrideSchema,
  UpdateScenarioOverrideSchema,
  rowFromParsed,
} from './schemas'
import {
  assertOverrideTargetInScope,
  assertScenarioOverrideInScope,
} from '@/lib/auth/scope'

function revalidateAll() {
  revalidatePath('/forecast/overrides')
  revalidatePath('/forecast')
  revalidatePath('/forecast/detail')
  revalidatePath('/forecast/compare')
}

export async function createScenarioOverride(formData: FormData) {
  await requireAuth()
  const parsed = CreateScenarioOverrideSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  if (!(await assertOverrideTargetInScope(parsed.data.targetType, parsed.data.targetId))) {
    return { error: 'Target not in your scope' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('scenario_overrides').insert(rowFromParsed(parsed.data))
  if (error) return { error: 'Failed to create override' }

  revalidateAll()
  return { ok: true }
}

export async function updateScenarioOverride(formData: FormData) {
  await requireAuth()
  const parsed = UpdateScenarioOverrideSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  // Both the existing override AND the (possibly new) target must be in scope.
  const [overrideOk, targetOk] = await Promise.all([
    assertScenarioOverrideInScope(parsed.data.id),
    assertOverrideTargetInScope(parsed.data.targetType, parsed.data.targetId),
  ])
  if (!overrideOk) return { error: 'Override not in your scope' }
  if (!targetOk) return { error: 'Target not in your scope' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('scenario_overrides')
    .update(rowFromParsed(parsed.data))
    .eq('id', parsed.data.id)
  if (error) return { error: 'Failed to update override' }

  revalidateAll()
  return { ok: true }
}

export async function deleteScenarioOverride(id: string) {
  await requireAuth()
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { error: 'Invalid id' }

  if (!(await assertScenarioOverrideInScope(parsed.data))) {
    return { error: 'Override not in your scope' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('scenario_overrides').delete().eq('id', parsed.data)
  if (error) return { error: 'Failed to delete override' }

  revalidateAll()
  return { ok: true }
}

'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { computeSyncLines } from '@/lib/pipeline/sync-engine'
import { getWeeksInMonth } from '@/lib/pipeline/fiscal-year'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateProjectSchema = z.object({
  clientName: z.string().min(1),
  entityId: z.string().uuid(),
  jobNumber: z.string().optional(),
  projectName: z.string().min(1),
  taskEstimate: z.string().optional(),
  stage: z.enum(['confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined']),
  teamMember: z.string().optional(),
  billingAmount: z.number().optional(),
  thirdPartyCosts: z.number().optional(),
  invoiceDate: z.string().optional(),
  notes: z.string().optional(),
})

const UpdateAllocationsSchema = z.object({
  projectId: z.string().uuid(),
  allocations: z.array(
    z.object({
      month: z.string(),
      amount: z.number(),
      distribution: z
        .enum(['even', 'first_week', 'last_week', 'custom'])
        .default('even'),
    }),
  ),
})

const UpdateTargetsSchema = z.object({
  targets: z.array(
    z.object({
      entityId: z.string().uuid(),
      month: z.string(),
      targetAmount: z.number(),
    }),
  ),
})

// ---------------------------------------------------------------------------
// Internal sync helper
// ---------------------------------------------------------------------------

async function syncProject(projectId: string) {
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('pipeline_projects')
    .select('*, pipeline_clients(name)')
    .eq('id', projectId)
    .single()

  if (!project || !project.is_synced) return

  const { data: allocations } = await admin
    .from('pipeline_allocations')
    .select('*')
    .eq('project_id', projectId)

  const { data: periods } = await admin
    .from('forecast_periods')
    .select('id, week_ending')
    .order('week_ending')

  const { data: arCategory } = await admin
    .from('categories')
    .select('id')
    .eq('code', 'inflows_ar')
    .single()

  const { data: bankAccount } = await admin
    .from('bank_accounts')
    .select('id')
    .eq('entity_id', project.entity_id)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!arCategory || !bankAccount) return

  const allWeekEndings = (periods ?? []).map((p: any) => p.week_ending as string)
  const periodMap: Record<string, string> = {}
  for (const p of periods ?? []) {
    periodMap[(p as any).week_ending] = (p as any).id
  }

  // Delete existing synced lines for this project
  await admin
    .from('forecast_lines')
    .delete()
    .eq('source_pipeline_project_id', projectId)

  // Build new lines
  const clientName = (project.pipeline_clients as any)?.name ?? 'Unknown'
  const newLines: any[] = []

  for (const rawAlloc of allocations ?? []) {
    const allocation = {
      id: rawAlloc.id,
      projectId: rawAlloc.project_id,
      month: rawAlloc.month,
      amount: Number(rawAlloc.amount) || 0,
      distribution: rawAlloc.distribution as any,
    }
    const weekEndings = getWeeksInMonth(allWeekEndings, allocation.month)

    const lines = computeSyncLines({
      allocation,
      stage: project.stage as any,
      entityId: project.entity_id,
      projectId: project.id,
      clientName,
      bankAccountId: bankAccount.id,
      arCategoryId: arCategory.id,
      weekEndings,
      periodMap,
    })

    for (const line of lines) {
      newLines.push({
        entity_id: line.entityId,
        category_id: line.categoryId,
        period_id: line.periodId,
        bank_account_id: line.bankAccountId,
        amount: line.amount,
        confidence: line.confidence,
        source: 'pipeline',
        source_pipeline_project_id: line.sourcePipelineProjectId,
        counterparty: line.counterparty,
        line_status: line.lineStatus,
      })
    }
  }

  if (newLines.length > 0) {
    await admin.from('forecast_lines').insert(newLines)
  }
}

// ---------------------------------------------------------------------------
// Exported server actions
// ---------------------------------------------------------------------------

export async function createProject(
  input: z.infer<typeof CreateProjectSchema>,
) {
  await requireAuth()

  const parsed = CreateProjectSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const {
    clientName,
    entityId,
    jobNumber,
    projectName,
    taskEstimate,
    stage,
    teamMember,
    billingAmount,
    thirdPartyCosts,
    invoiceDate,
    notes,
  } = parsed.data

  const admin = createAdminClient()

  // Upsert client by (entity_id, name)
  const { data: client, error: clientError } = await admin
    .from('pipeline_clients')
    .upsert({ entity_id: entityId, name: clientName }, { onConflict: 'entity_id,name' })
    .select('id')
    .single()

  if (clientError || !client) {
    return { error: 'Failed to upsert client' }
  }

  // Compute gross profit if billing info is provided
  const grossProfit =
    billingAmount !== undefined
      ? billingAmount - (thirdPartyCosts ?? 0)
      : undefined

  const { data: project, error: projectError } = await admin
    .from('pipeline_projects')
    .insert({
      client_id: client.id,
      entity_id: entityId,
      job_number: jobNumber ?? null,
      name: projectName,
      task_estimate: taskEstimate ?? null,
      stage,
      team_member: teamMember ?? null,
      billing_amount: billingAmount ?? null,
      third_party_costs: thirdPartyCosts ?? null,
      gross_profit: grossProfit ?? null,
      invoice_date: invoiceDate ?? null,
      notes: notes ?? null,
      is_synced: false,
    })
    .select()
    .single()

  if (projectError || !project) {
    return { error: 'Failed to create project' }
  }

  revalidatePath('/pipeline')
  return { data: project }
}

export async function updateProjectStage(
  projectId: string,
  stage: 'confirmed' | 'awaiting_approval' | 'upcoming' | 'speculative' | 'declined',
) {
  await requireAuth()

  const StageSchema = z.enum(['confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined'])
  const parsedStage = StageSchema.safeParse(stage)
  if (!parsedStage.success) return { error: 'Invalid stage value' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('pipeline_projects')
    .update({ stage: parsedStage.data })
    .eq('id', projectId)

  if (error) return { error: 'Failed to update project stage' }

  await syncProject(projectId)

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function updateAllocations(
  input: z.infer<typeof UpdateAllocationsSchema>,
) {
  await requireAuth()

  const parsed = UpdateAllocationsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const { projectId, allocations } = parsed.data
  const admin = createAdminClient()

  for (const alloc of allocations) {
    if (alloc.amount === 0) {
      // Delete zero-amount allocations
      await admin
        .from('pipeline_allocations')
        .delete()
        .eq('project_id', projectId)
        .eq('month', alloc.month)
    } else {
      // Upsert non-zero allocations
      await admin
        .from('pipeline_allocations')
        .upsert(
          {
            project_id: projectId,
            month: alloc.month,
            amount: alloc.amount,
            distribution: alloc.distribution,
          },
          { onConflict: 'project_id,month' },
        )
    }
  }

  await syncProject(projectId)

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function updateTargets(
  input: z.infer<typeof UpdateTargetsSchema>,
) {
  await requireAuth()

  const parsed = UpdateTargetsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.message }

  const { targets } = parsed.data
  const admin = createAdminClient()

  for (const target of targets) {
    await admin
      .from('pipeline_targets')
      .upsert(
        {
          entity_id: target.entityId,
          month: target.month,
          target_amount: target.targetAmount,
        },
        { onConflict: 'entity_id,month' },
      )
  }

  revalidatePath('/pipeline')
  revalidatePath('/pipeline/targets')
  return { ok: true }
}

export async function deleteProject(projectId: string) {
  await requireAuth()

  const admin = createAdminClient()

  // Remove synced forecast lines first
  await admin
    .from('forecast_lines')
    .delete()
    .eq('source_pipeline_project_id', projectId)

  // Delete project (cascades allocations via FK)
  const { error } = await admin
    .from('pipeline_projects')
    .delete()
    .eq('id', projectId)

  if (error) return { error: 'Failed to delete project' }

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function toggleProjectSync(projectId: string, isSynced: boolean) {
  await requireAuth()

  const admin = createAdminClient()

  const { error } = await admin
    .from('pipeline_projects')
    .update({ is_synced: isSynced })
    .eq('id', projectId)

  if (error) return { error: 'Failed to toggle project sync' }

  if (isSynced) {
    await syncProject(projectId)
  } else {
    // Remove all synced forecast lines for this project
    await admin
      .from('forecast_lines')
      .delete()
      .eq('source_pipeline_project_id', projectId)
  }

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

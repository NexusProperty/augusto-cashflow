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
  isSynced: z.boolean().default(true),
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
    isSynced,
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
      project_name: projectName,
      task_estimate: taskEstimate ?? null,
      stage,
      team_member: teamMember ?? null,
      billing_amount: billingAmount ?? null,
      third_party_costs: thirdPartyCosts ?? null,
      gross_profit: grossProfit ?? null,
      invoice_date: invoiceDate ?? null,
      notes: notes ?? null,
      is_synced: isSynced ?? true,
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

  const id = z.string().uuid().safeParse(projectId)
  if (!id.success) return { error: 'Invalid project ID' }

  const StageSchema = z.enum(['confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined'])
  const parsedStage = StageSchema.safeParse(stage)
  if (!parsedStage.success) return { error: 'Invalid stage value' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('pipeline_projects')
    .update({ stage: parsedStage.data })
    .eq('id', id.data)

  if (error) return { error: 'Failed to update project stage' }

  await syncProject(id.data)

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

  const rows = targets.map((t) => ({
    entity_id: t.entityId,
    month: t.month,
    target_amount: t.targetAmount,
    updated_at: new Date().toISOString(),
  }))
  await admin.from('revenue_targets').upsert(rows, { onConflict: 'entity_id,month' })

  revalidatePath('/pipeline')
  revalidatePath('/pipeline/targets')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Excel import actions
// ---------------------------------------------------------------------------

export async function importFromExcel(formData: FormData) {
  await requireAuth()
  const file = formData.get('file') as File
  if (!file || file.size === 0) return { error: 'No file provided' }

  const { parseRevenueTracker } = await import('@/lib/pipeline/excel-import')
  const buffer = await file.arrayBuffer()
  const result = await parseRevenueTracker(buffer)

  return {
    data: {
      projects: result.projects,
      targets: result.targets,
      errors: result.errors,
    },
  }
}

export async function commitImport(
  projects: any[],
  targets: any[],
  entityMap: Record<string, string>,
) {
  const user = await requireAuth()

  const ImportSchema = z.object({
    projects: z.array(z.any()),
    targets: z.array(z.any()),
    entityMap: z.record(z.string(), z.string()),
  })
  const parsed = ImportSchema.safeParse({ projects, targets, entityMap })
  if (!parsed.success) return { error: 'Invalid import parameters' }

  const admin = createAdminClient()

  let created = 0

  for (const proj of parsed.data.projects) {
    const entityId = parsed.data.entityMap[proj.entityCode]
    if (!entityId) continue

    // Upsert client
    const { data: client } = await admin
      .from('pipeline_clients')
      .upsert({ entity_id: entityId, name: proj.clientName }, { onConflict: 'entity_id,name' })
      .select()
      .single()

    if (!client) continue

    // Insert project
    const { data: project } = await admin
      .from('pipeline_projects')
      .insert({
        client_id: client.id,
        entity_id: entityId,
        job_number: proj.jobNumber,
        project_name: proj.projectName,
        task_estimate: proj.taskEstimate,
        stage: proj.stage,
        team_member: proj.teamMember,
        billing_amount: proj.billingAmount,
        third_party_costs: proj.thirdPartyCosts,
        notes: proj.notes,
        created_by: user.id,
      })
      .select()
      .single()

    if (!project) continue

    // Insert allocations
    const allocRows = proj.allocations.map((a: any) => ({
      project_id: project.id,
      month: a.month,
      amount: a.amount,
    }))

    if (allocRows.length > 0) {
      await admin.from('pipeline_allocations').insert(allocRows)
    }

    await syncProject(project.id)

    created++
  }

  // Import targets
  for (const t of parsed.data.targets) {
    const entityId = parsed.data.entityMap[t.entityCode]
    if (!entityId) continue

    await admin
      .from('revenue_targets')
      .upsert(
        { entity_id: entityId, month: t.month, target_amount: t.amount },
        { onConflict: 'entity_id,month' },
      )
  }

  revalidatePath('/pipeline')
  revalidatePath('/pipeline/summary')
  revalidatePath('/pipeline/targets')
  revalidatePath('/forecast')

  return { ok: true, created }
}

export async function deleteProject(projectId: string) {
  await requireAuth()

  const id = z.string().uuid().safeParse(projectId)
  if (!id.success) return { error: 'Invalid project ID' }

  const admin = createAdminClient()

  // Remove synced forecast lines first
  await admin
    .from('forecast_lines')
    .delete()
    .eq('source_pipeline_project_id', id.data)

  // Delete project (cascades allocations via FK)
  const { error } = await admin
    .from('pipeline_projects')
    .delete()
    .eq('id', id.data)

  if (error) return { error: 'Failed to delete project' }

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

export async function toggleProjectSync(projectId: string, isSynced: boolean) {
  await requireAuth()

  const id = z.string().uuid().safeParse(projectId)
  if (!id.success) return { error: 'Invalid project ID' }

  const admin = createAdminClient()

  const { error } = await admin
    .from('pipeline_projects')
    .update({ is_synced: isSynced })
    .eq('id', id.data)

  if (error) return { error: 'Failed to toggle project sync' }

  if (isSynced) {
    await syncProject(id.data)
  } else {
    // Remove all synced forecast lines for this project
    await admin
      .from('forecast_lines')
      .delete()
      .eq('source_pipeline_project_id', id.data)
  }

  revalidatePath('/pipeline')
  revalidatePath('/forecast')
  return { ok: true }
}

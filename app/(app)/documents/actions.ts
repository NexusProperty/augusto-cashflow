'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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

const BulkUpdateSuggestionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  updates: z
    .object({
      suggestedEntityId: z.string().uuid().optional(),
      suggestedBankAccountId: z.string().uuid().optional(),
      suggestedCategoryId: z.string().uuid().optional(),
      suggestedPeriodId: z.string().uuid().optional(),
      suggestedStatus: z.enum(LINE_STATUSES).optional(),
    })
    .refine((u) => Object.values(u).some((v) => v !== undefined), {
      message: 'At least one field must be set',
    }),
})

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'message/rfc822',
])

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'message/rfc822': 'eml',
}

export async function uploadDocument(formData: FormData) {
  const user = await requireAuth()
  const file = formData.get('file') as File
  if (!file || file.size === 0) return { error: 'No file provided' }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: `Unsupported file type: ${file.type}` }
  }

  const admin = createAdminClient()

  const ext = MIME_TO_EXT[file.type] ?? 'bin'
  const storagePath = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('documents')
    .upload(storagePath, file, { contentType: file.type })

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` }

  const { data, error } = await admin
    .from('documents')
    .insert({
      filename: file.name,
      mime_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      status: 'uploaded',
      uploaded_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: 'Failed to save document record' }

  // Processing is triggered from the client after this returns — a
  // server-side fetch to our own /api/documents/process would not
  // forward the user's auth cookie and would 401. The client's fetch
  // carries the cookie automatically.

  revalidatePath('/documents')
  return { data }
}

export async function confirmExtraction(extractionId: string, overrides?: {
  amount?: number
  categoryId?: string
  entityId?: string
  periodId?: string
  bankAccountId?: string
  lineStatus?: string
}) {
  const user = await requireAuth()
  const admin = createAdminClient()

  const { data: extraction, error: fetchErr } = await admin
    .from('document_extractions')
    .select('*')
    .eq('id', extractionId)
    .single()

  if (fetchErr || !extraction) return { error: 'Extraction not found' }

  // Resolve entity by override UUID or by name lookup
  let entityId = overrides?.entityId
  if (!entityId && extraction.entity_name) {
    const { data: entity } = await admin
      .from('entities')
      .select('id')
      .ilike('name', extraction.entity_name)
      .limit(1)
      .single()
    entityId = entity?.id
  }
  if (!entityId) return { error: 'Entity not resolved — please select an entity' }

  const categoryId = overrides?.categoryId
  if (!categoryId) return { error: 'Category not resolved — please select a category' }

  const periodId = overrides?.periodId
  if (!periodId) return { error: 'Period not specified — please select a forecast week' }

  const bankAccountId = overrides?.bankAccountId
  if (!bankAccountId) return { error: 'Bank account not specified — please select a bank account' }

  const { data: line, error: lineErr } = await admin
    .from('forecast_lines')
    .insert({
      entity_id: entityId,
      category_id: categoryId,
      period_id: periodId,
      bank_account_id: bankAccountId,
      amount: overrides?.amount ?? extraction.amount ?? 0,
      confidence: 100,
      source: 'document',
      line_status: overrides?.lineStatus ?? 'none',
      source_document_id: extraction.document_id,
      counterparty: extraction.counterparty,
      notes: extraction.invoice_number ? `Invoice: ${extraction.invoice_number}` : null,
      created_by: user.id,
    })
    .select()
    .single()

  if (lineErr) return { error: 'Failed to create forecast line' }

  await admin
    .from('document_extractions')
    .update({ is_confirmed: true, forecast_line_id: line.id })
    .eq('id', extractionId)

  revalidatePath('/documents')
  revalidatePath('/forecast')
  return { data: line }
}

export async function dismissExtraction(extractionId: string) {
  await requireAuth()
  const admin = createAdminClient()
  await admin
    .from('document_extractions')
    .update({ is_dismissed: true })
    .eq('id', extractionId)

  revalidatePath('/documents')
  return { ok: true }
}

export async function bulkConfirmExtractions(extractionIds: string[]) {
  const user = await requireAuth()
  if (extractionIds.length === 0) return { error: 'No extraction IDs provided' }

  const admin = createAdminClient()

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

/**
 * Bulk-apply one or more `suggested_*` field values to many pending extractions.
 * Used by the Needs Attention multi-select bar so the user can fill in the
 * same missing field (e.g. category, bank account, status) across every
 * selected card in one click. Fully-resolved items graduate to the Pending
 * Review tier on the next render.
 */
export async function bulkUpdateExtractionSuggestions(
  ids: string[],
  updates: {
    suggestedEntityId?: string
    suggestedBankAccountId?: string
    suggestedCategoryId?: string
    suggestedPeriodId?: string
    suggestedStatus?: string
  },
) {
  await requireAuth()
  const parsed = BulkUpdateSuggestionsSchema.safeParse({ ids, updates })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const u = parsed.data.updates
  const patch: {
    suggested_entity_id?: string
    suggested_bank_account_id?: string
    suggested_category_id?: string
    suggested_period_id?: string
    suggested_status?: string
  } = {}
  if (u.suggestedEntityId) patch.suggested_entity_id = u.suggestedEntityId
  if (u.suggestedBankAccountId) patch.suggested_bank_account_id = u.suggestedBankAccountId
  if (u.suggestedCategoryId) patch.suggested_category_id = u.suggestedCategoryId
  if (u.suggestedPeriodId) patch.suggested_period_id = u.suggestedPeriodId
  if (u.suggestedStatus) patch.suggested_status = u.suggestedStatus

  const admin = createAdminClient()
  const { error } = await admin
    .from('document_extractions')
    .update(patch)
    .in('id', parsed.data.ids)
    .eq('is_confirmed', false)
    .eq('is_dismissed', false)

  if (error) return { error: 'Failed to update extractions' }

  revalidatePath('/documents')
  return { ok: true, count: parsed.data.ids.length }
}

/**
 * One-click "fill the gap then confirm" for the Needs Attention bar:
 *  1. Apply bulk suggestion patch to the selected extractions.
 *  2. For every selected item that's now fully resolved, insert a forecast
 *     line and mark the extraction confirmed.
 *  3. Return a count of how many were confirmed vs still missing fields.
 *
 * Items that stay incomplete after the patch are left alone and remain in
 * Needs Attention, so the user can fix them individually.
 */
export async function bulkApplyAndConfirm(
  ids: string[],
  updates: {
    suggestedEntityId?: string
    suggestedBankAccountId?: string
    suggestedCategoryId?: string
    suggestedPeriodId?: string
    suggestedStatus?: string
  },
) {
  const user = await requireAuth()
  const parsed = BulkUpdateSuggestionsSchema.safeParse({ ids, updates })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const u = parsed.data.updates
  const patch: {
    suggested_entity_id?: string
    suggested_bank_account_id?: string
    suggested_category_id?: string
    suggested_period_id?: string
    suggested_status?: string
  } = {}
  if (u.suggestedEntityId) patch.suggested_entity_id = u.suggestedEntityId
  if (u.suggestedBankAccountId) patch.suggested_bank_account_id = u.suggestedBankAccountId
  if (u.suggestedCategoryId) patch.suggested_category_id = u.suggestedCategoryId
  if (u.suggestedPeriodId) patch.suggested_period_id = u.suggestedPeriodId
  if (u.suggestedStatus) patch.suggested_status = u.suggestedStatus

  const admin = createAdminClient()

  if (Object.keys(patch).length > 0) {
    const { error: patchErr } = await admin
      .from('document_extractions')
      .update(patch)
      .in('id', parsed.data.ids)
      .eq('is_confirmed', false)
      .eq('is_dismissed', false)
    if (patchErr) return { error: 'Failed to update extractions' }
  }

  // Re-read post-patch so we can decide who's now fully resolved.
  const { data: extractions, error: fetchErr } = await admin
    .from('document_extractions')
    .select('*')
    .in('id', parsed.data.ids)
    .eq('is_confirmed', false)
    .eq('is_dismissed', false)

  if (fetchErr || !extractions) return { error: 'Failed to read extractions' }

  const ready = extractions.filter(
    (ext) =>
      ext.suggested_entity_id &&
      ext.suggested_bank_account_id &&
      ext.suggested_category_id &&
      ext.suggested_period_id &&
      ext.suggested_status,
  )
  const stillMissing = extractions.length - ready.length

  let confirmedCount = 0
  if (ready.length > 0) {
    const lineRows = ready.map((ext) => ({
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

    for (let i = 0; i < ready.length; i++) {
      await admin
        .from('document_extractions')
        .update({ is_confirmed: true, forecast_line_id: lines[i]!.id })
        .eq('id', ready[i]!.id)
    }
    confirmedCount = lines.length
  }

  revalidatePath('/documents')
  revalidatePath('/forecast')
  revalidatePath('/forecast/detail')
  return { ok: true, confirmedCount, stillMissing }
}

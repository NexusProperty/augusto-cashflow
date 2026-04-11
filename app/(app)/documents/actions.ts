'use server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function uploadDocument(formData: FormData) {
  const user = await requireAuth()
  const file = formData.get('file') as File
  if (!file || file.size === 0) return { error: 'No file provided' }

  const admin = createAdminClient()

  const ext = file.name.split('.').pop() ?? 'bin'
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

  // Trigger edge function processing (fire-and-forget)
  admin.functions.invoke('process-document', {
    body: { documentId: data.id },
  }).catch((err) => {
    console.error('Failed to invoke process-document:', err)
  })

  revalidatePath('/documents')
  return { data }
}

export async function confirmExtraction(extractionId: string, overrides?: {
  amount?: number
  categoryId?: string
  entityId?: string
  periodId?: string
}) {
  const user = await requireAuth()
  const admin = createAdminClient()

  const { data: extraction, error: fetchErr } = await admin
    .from('document_extractions')
    .select('*')
    .eq('id', extractionId)
    .single()

  if (fetchErr || !extraction) return { error: 'Extraction not found' }

  const { data: line, error: lineErr } = await admin
    .from('forecast_lines')
    .insert({
      entity_id: overrides?.entityId ?? extraction.entity_name,
      category_id: overrides?.categoryId ?? extraction.category_name,
      period_id: overrides?.periodId,
      amount: overrides?.amount ?? extraction.amount,
      confidence: 100,
      source: 'document',
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

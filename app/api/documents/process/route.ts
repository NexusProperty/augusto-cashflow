import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { parse as csvParse } from 'csv-parse/sync'
import mammoth from 'mammoth'
import { ExtractionResult } from '@/lib/documents/extraction-schema'
import { fetchReferenceData, formatReferenceDataForPrompt } from '@/lib/documents/reference-data'
import { buildContextPrompt } from '@/lib/documents/extraction-prompt'
import { resolveExtraction, isFullyResolved } from '@/lib/documents/resolve-extraction'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const AUTO_CONFIRM_THRESHOLD = 0.9

async function extractText(blob: Blob, mimeType: string): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer())

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimeType === 'application/vnd.ms-excel') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheets: string[] = []
    workbook.eachSheet((sheet) => {
      const rows: string[] = [`=== Sheet: ${sheet.name} ===`]
      sheet.eachRow((row, rowNumber) => {
        const values = (row.values as any[]).slice(1).map(v => {
          if (v === null || v === undefined) return ''
          if (typeof v === 'object' && v.result !== undefined) return String(v.result)
          if (typeof v === 'object' && v.text) return String(v.text)
          return String(v)
        })
        rows.push(`Row ${rowNumber}: ${values.join(' | ')}`)
      })
      sheets.push(rows.join('\n'))
    })
    return sheets.join('\n\n')
  }

  if (mimeType === 'text/csv') {
    const text = buffer.toString('utf-8')
    const records = csvParse(text, { relax_column_count: true })
    return records.map((row: string[], i: number) => `Row ${i + 1}: ${row.join(' | ')}`).join('\n')
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (mimeType === 'application/pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(buffer)
      return result.text
    } catch {
      return buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    }
  }

  return blob.text()
}

export async function POST(req: Request) {
  try {
    const { documentId } = await req.json()
    if (!documentId) return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
    if (!OPENROUTER_API_KEY) return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 })

    const supabase = createAdminClient()

    // Get document record
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Update status to parsing
    await supabase.from('documents').update({ status: 'parsing' }).eq('id', documentId)

    // Download file + fetch reference data in parallel
    const [fileResult, refData] = await Promise.all([
      supabase.storage.from('documents').download(doc.storage_path),
      fetchReferenceData(),
    ])

    if (fileResult.error || !fileResult.data) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Download failed' }).eq('id', documentId)
      return NextResponse.json({ error: 'Download failed' }, { status: 500 })
    }

    // Update status to extracting
    await supabase.from('documents').update({ status: 'extracting' }).eq('id', documentId)

    // Build context-injected prompt
    const refBlock = formatReferenceDataForPrompt(refData)
    const sanitizedName = sanitizeFilename(doc.filename)

    const isImage = doc.mime_type.startsWith('image/')
    let messages: any[]

    if (isImage) {
      const buffer = await fileResult.data.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: buildContextPrompt(sanitizedName, refBlock) },
          { type: 'image_url', image_url: { url: `data:${doc.mime_type};base64,${base64}` } },
        ],
      }]
    } else {
      const textContent = await extractText(fileResult.data, doc.mime_type)
      messages = [{
        role: 'user',
        content: buildContextPrompt(sanitizedName, refBlock) + '\n\n---\n\nDOCUMENT CONTENT:\n\n' + textContent.slice(0, 50000),
      }]
    }

    // Call Claude via OpenRouter
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      await supabase.from('documents').update({ status: 'failed', error_message: `AI error: ${errText.slice(0, 200)}` }).eq('id', documentId)
      return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 })
    }

    const aiResult = await aiResponse.json()
    const content = aiResult.choices?.[0]?.message?.content
    if (!content) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'No AI response' }).eq('id', documentId)
      return NextResponse.json({ error: 'No AI response' }, { status: 500 })
    }

    // Parse and validate with Zod
    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Invalid JSON from AI' }).eq('id', documentId)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 500 })
    }

    const validated = ExtractionResult.safeParse(parsed)
    if (!validated.success) {
      await supabase.from('documents').update({ status: 'failed', error_message: `Schema validation: ${validated.error.message.slice(0, 200)}` }).eq('id', documentId)
      return NextResponse.json({ error: 'Schema validation failed' }, { status: 500 })
    }

    const { classification, items } = validated.data

    // Update doc type
    await supabase.from('documents').update({ doc_type: classification.documentType }).eq('id', documentId)

    // Resolve and insert extractions
    let autoConfirmedCount = 0

    if (items.length > 0) {
      const rows = items.map(item => {
        const resolved = resolveExtraction({
          entityCode: item.entityCode,
          bankAccountNumber: item.bankAccountNumber,
          categoryCode: item.categoryCode,
          suggestedWeekEnding: item.suggestedWeekEnding,
          suggestedStatus: item.suggestedStatus,
        }, refData)

        return {
          document_id: documentId,
          counterparty: item.counterparty,
          amount: item.amount,
          expected_date: item.expectedDate,
          invoice_number: item.invoiceNumber,
          entity_name: item.entityCode,
          category_name: item.categoryCode,
          payment_terms: item.paymentTerms,
          confidence: item.confidence,
          raw_text: item.rawText?.slice(0, 1000),
          suggested_entity_id: resolved.entityId,
          suggested_bank_account_id: resolved.bankAccountId,
          suggested_category_id: resolved.categoryId,
          suggested_period_id: resolved.periodId,
          suggested_status: resolved.status,
          status_reason: item.statusReason,
        }
      })

      // Cast: database.types.ts is stale, missing suggested_* columns
      const { data: insertedRows } = await supabase
        .from('document_extractions')
        .insert(rows as any)
        .select()

      // Auto-confirm high-confidence, fully-resolved items
      if (insertedRows) {
        for (const ext of insertedRows as any[]) {
          const resolved = {
            entityId: ext.suggested_entity_id,
            bankAccountId: ext.suggested_bank_account_id,
            categoryId: ext.suggested_category_id,
            periodId: ext.suggested_period_id,
            status: ext.suggested_status,
          }

          if (ext.confidence >= AUTO_CONFIRM_THRESHOLD && isFullyResolved(resolved)) {
            const { data: line } = await supabase
              .from('forecast_lines')
              .insert({
                entity_id: resolved.entityId!,
                category_id: resolved.categoryId!,
                period_id: resolved.periodId!,
                bank_account_id: resolved.bankAccountId!,
                amount: ext.amount ?? 0,
                confidence: Math.round(ext.confidence * 100),
                source: 'document',
                line_status: resolved.status!,
                source_document_id: documentId,
                counterparty: ext.counterparty,
                notes: ext.invoice_number ? `Invoice: ${ext.invoice_number}` : null,
              } as any)
              .select()
              .single()

            if (line) {
              await supabase
                .from('document_extractions')
                .update({
                  is_confirmed: true,
                  auto_confirmed: true,
                  forecast_line_id: line.id,
                } as any)
                .eq('id', ext.id)

              autoConfirmedCount++
            }
          }
        }
      }
    }

    // Mark as ready for review
    await supabase.from('documents').update({ status: 'ready_for_review' }).eq('id', documentId)

    return NextResponse.json({
      ok: true,
      extractionCount: items.length,
      autoConfirmedCount,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '').slice(0, 100)
}

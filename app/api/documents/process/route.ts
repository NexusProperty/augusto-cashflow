import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { parse as csvParse } from 'csv-parse/sync'
import mammoth from 'mammoth'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

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
    // pdf-parse has issues in Next.js edge/serverless — use raw text fallback
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

    // Download file from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('documents')
      .download(doc.storage_path)

    if (dlErr || !fileData) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Download failed' }).eq('id', documentId)
      return NextResponse.json({ error: 'Download failed' }, { status: 500 })
    }

    // Update status to extracting
    await supabase.from('documents').update({ status: 'extracting' }).eq('id', documentId)

    // Prepare content for AI
    const isImage = doc.mime_type.startsWith('image/')
    const sanitizedName = sanitizeFilename(doc.filename)

    let messages: any[]
    if (isImage) {
      const buffer = await fileData.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: buildExtractionPrompt(sanitizedName) },
          { type: 'image_url', image_url: { url: `data:${doc.mime_type};base64,${base64}` } },
        ],
      }]
    } else {
      const textContent = await extractText(fileData, doc.mime_type)
      messages = [{
        role: 'user',
        content: buildExtractionPrompt(sanitizedName) + '\n\n---\n\nDOCUMENT CONTENT:\n\n' + textContent.slice(0, 50000),
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

    let parsed: any
    try {
      parsed = JSON.parse(content)
    } catch {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Invalid JSON from AI' }).eq('id', documentId)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 500 })
    }

    // Validate classification
    const validDocTypes = ['aged_receivables', 'aged_payables', 'bank_statement', 'invoice', 'loan_agreement', 'payroll_summary', 'contract', 'board_paper', 'other']
    const docType = validDocTypes.includes(parsed.classification?.documentType) ? parsed.classification.documentType : 'other'

    await supabase.from('documents').update({ doc_type: docType }).eq('id', documentId)

    // Insert extractions
    const items = Array.isArray(parsed.items) ? parsed.items : []
    if (items.length > 0) {
      const rows = items.map((item: any) => ({
        document_id: documentId,
        counterparty: item.counterparty,
        amount: item.amount,
        expected_date: item.expectedDate,
        invoice_number: item.invoiceNumber,
        entity_name: item.entityName,
        category_name: item.categoryHint,
        payment_terms: item.paymentTerms,
        confidence: item.confidence ?? 0.5,
        raw_text: item.rawText?.slice(0, 1000),
      }))

      await supabase.from('document_extractions').insert(rows)
    }

    // Mark as ready for review
    await supabase.from('documents').update({ status: 'ready_for_review' }).eq('id', documentId)

    return NextResponse.json({ ok: true, extractionCount: items.length })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function buildExtractionPrompt(filename: string): string {
  return `You are a financial document analyst for Augusto Group, a New Zealand creative/advertising agency group.

Analyze this document and extract ALL financially relevant items. The document filename is: ${filename}

Respond with JSON in this exact format:
{
  "classification": {
    "documentType": "aged_receivables" | "aged_payables" | "bank_statement" | "invoice" | "loan_agreement" | "payroll_summary" | "contract" | "board_paper" | "other",
    "confidence": 0.0 to 1.0
  },
  "items": [
    {
      "counterparty": "Client or supplier name",
      "amount": 12345.67,
      "expectedDate": "2026-04-10",
      "invoiceNumber": "INV-001" or null,
      "entityName": "Augusto" | "Cornerstore" | "Dark Doris" | "Coachmate" | "Ballyhoo" | "Wrestler" | null,
      "categoryHint": "accounts_receivable" | "accounts_payable" | "payroll" | "rent" | "loan" | "other",
      "paymentTerms": "60 days" or null,
      "confidence": 0.0 to 1.0,
      "rawText": "The source text this was extracted from"
    }
  ]
}

Rules:
- Extract EVERY line item with a dollar amount
- Amounts should be in NZD (convert if needed, noting the original currency)
- Positive amounts = money coming in (receivables, receipts)
- Negative amounts = money going out (payables, expenses)
- For aged debtor/creditor reports, extract each invoice as a separate item
- For bank statements, extract each transaction
- If you can identify which Augusto Group entity this relates to, set entityName
- Set confidence based on how certain you are about each extraction`
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '').slice(0, 100)
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  try {
    const { documentId } = await req.json()
    if (!documentId) return new Response('Missing documentId', { status: 400 })

    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docErr || !doc) return new Response('Document not found', { status: 404 })

    await supabase.from('documents').update({ status: 'parsing' }).eq('id', documentId)

    const { data: fileData, error: dlErr } = await supabase.storage
      .from('documents')
      .download(doc.storage_path)

    if (dlErr || !fileData) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'Download failed' }).eq('id', documentId)
      return new Response('Download failed', { status: 500 })
    }

    const isImage = doc.mime_type.startsWith('image/')
    let textContent = ''

    if (isImage) {
      textContent = `[Image document: ${doc.filename}]`
    } else {
      textContent = await fileData.text()
    }

    await supabase.from('documents').update({ status: 'extracting' }).eq('id', documentId)

    const messages: any[] = [{
      role: 'user',
      content: isImage
        ? [
            { type: 'text', text: buildExtractionPrompt(doc.filename) },
            { type: 'image_url', image_url: { url: `data:${doc.mime_type};base64,${btoa(String.fromCharCode(...new Uint8Array(await fileData.arrayBuffer())))}` } },
          ]
        : buildExtractionPrompt(doc.filename) + '\n\n---\n\nDOCUMENT CONTENT:\n\n' + textContent.slice(0, 50000),
    }]

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-20250514',
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      }),
    })

    if (!aiResponse.ok) {
      const errText = await aiResponse.text()
      await supabase.from('documents').update({ status: 'failed', error_message: `AI error: ${errText.slice(0, 200)}` }).eq('id', documentId)
      return new Response('AI extraction failed', { status: 500 })
    }

    const aiResult = await aiResponse.json()
    const content = aiResult.choices?.[0]?.message?.content
    if (!content) {
      await supabase.from('documents').update({ status: 'failed', error_message: 'No AI response' }).eq('id', documentId)
      return new Response('No AI response', { status: 500 })
    }

    const parsed = JSON.parse(content)

    await supabase.from('documents').update({
      doc_type: parsed.classification?.documentType ?? 'other',
    }).eq('id', documentId)

    const items = parsed.items ?? []
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

    await supabase.from('documents').update({ status: 'ready_for_review' }).eq('id', documentId)

    return new Response(JSON.stringify({ ok: true, extractionCount: items.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('process-document error:', err)
    return new Response('Internal error', { status: 500 })
  }
})

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
      "entityName": "Augusto" | "Cornerstone" | "Dark Doris" | "Coachmate" | "Ballyhoo" | "Wrestler" | null,
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

export function buildContextPrompt(filename: string, referenceDataBlock: string): string {
  return `You are a financial document analyst for Augusto Group, a New Zealand creative/advertising agency group.

Analyze this document and extract ALL financially relevant items. The document filename is: ${filename}

## REFERENCE DATA — use these exact values in your response

${referenceDataBlock}

## STATUS INFERENCE RULES

Use these rules to determine suggestedStatus based on document type:
- aged_receivables → "awaiting_payment"
- aged_payables → "awaiting_payment"
- bank_statement (cleared transaction) → "paid"
- invoice (sent, not paid) → "awaiting_payment"
- invoice (not yet raised) → "tbc"
- loan_agreement (repayment schedule) → "confirmed"
- payroll_summary (future run) → "confirmed"
- Insurance premium → "confirmed"
- board_paper / estimate → "speculative"
- Budget request → "awaiting_budget_approval"
- remittance_received → "remittance_received"

## OUTPUT FORMAT

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
      "entityCode": "cornerstore",
      "bankAccountNumber": "02-0108-0436551-000",
      "categoryCode": "outflows_ap",
      "suggestedStatus": "awaiting_payment",
      "suggestedWeekEnding": "2026-04-10",
      "statusReason": "Invoice raised but no payment confirmation in document",
      "paymentTerms": "60 days" or null,
      "confidence": 0.0 to 1.0,
      "rawText": "Source text excerpt this was extracted from"
    }
  ]
}

## RULES

- Extract EVERY line item with a dollar amount
- Amounts in NZD (convert if needed, note original currency in rawText)
- Positive amounts = money coming in (receivables, receipts)
- Negative amounts = money going out (payables, expenses)
- For aged debtor/creditor reports, extract each invoice as a separate item
- For bank statements, extract each transaction
- entityCode MUST be one of the entity names from ENTITIES above (lowercase). If unsure, use null.
- bankAccountNumber MUST be one of the account numbers from BANK ACCOUNTS above. If unsure, use null.
- categoryCode MUST be one of the codes from CATEGORIES above. If unsure, use null.
- suggestedWeekEnding MUST be one of the dates from FORECAST PERIODS above. Pick the week the payment is expected to land in. If unsure, use null.
- suggestedStatus MUST follow the STATUS INFERENCE RULES above. Always provide statusReason explaining your choice.
- Set confidence based on how certain you are about the FULL extraction (all fields).`
}

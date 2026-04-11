import { z } from 'zod'

export const DocumentClassification = z.object({
  documentType: z.enum([
    'aged_receivables', 'aged_payables', 'bank_statement', 'invoice',
    'loan_agreement', 'payroll_summary', 'contract', 'board_paper', 'other',
  ]),
  confidence: z.number().min(0).max(1),
})

export const ExtractionItem = z.object({
  counterparty: z.string().nullable(),
  amount: z.number().nullable(),
  expectedDate: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  entityCode: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  categoryCode: z.string().nullable(),
  suggestedStatus: z.string().nullable(),
  suggestedWeekEnding: z.string().nullable(),
  statusReason: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rawText: z.string(),
})

export const ExtractionResult = z.object({
  classification: DocumentClassification,
  items: z.array(ExtractionItem),
})

export type ExtractionItemType = z.infer<typeof ExtractionItem>
export type ExtractionResultType = z.infer<typeof ExtractionResult>

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
  entityName: z.string().nullable(),
  categoryHint: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rawText: z.string(),
})

export const ExtractionResult = z.object({
  classification: DocumentClassification,
  items: z.array(ExtractionItem),
})

export type ExtractionResultType = z.infer<typeof ExtractionResult>

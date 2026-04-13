import { z } from 'zod'

export const DocumentClassification = z.object({
  documentType: z.enum([
    'aged_receivables', 'aged_payables', 'bank_statement', 'invoice',
    'loan_agreement', 'payroll_summary', 'contract', 'board_paper', 'other',
  ]),
  confidence: z.number().min(0).max(1),
})

// Optional + nullable + default(null): the AI sometimes omits keys it's
// unsure about instead of emitting null. Normalize missing → null so a
// single absent field doesn't throw out the whole batch.
const nstring = () => z.string().nullable().optional().default(null)
const nnumber = () => z.number().nullable().optional().default(null)

export const ExtractionItem = z.object({
  counterparty: nstring(),
  amount: nnumber(),
  expectedDate: nstring(),
  invoiceNumber: nstring(),
  entityCode: nstring(),
  bankAccountNumber: nstring(),
  categoryCode: nstring(),
  suggestedStatus: nstring(),
  suggestedWeekEnding: nstring(),
  statusReason: nstring(),
  paymentTerms: nstring(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  rawText: z.string().optional().default(''),
})

export const ExtractionResult = z.object({
  classification: DocumentClassification,
  items: z.array(ExtractionItem),
})

export type ExtractionItemType = z.infer<typeof ExtractionItem>
export type ExtractionResultType = z.infer<typeof ExtractionResult>

import { describe, it, expect } from 'vitest'
import { ExtractionItem, ExtractionResult } from '@/lib/documents/extraction-schema'

describe('ExtractionItem', () => {
  it('accepts the expanded AI output format', () => {
    const item = {
      counterparty: 'Acme Corp',
      amount: 12345.67,
      expectedDate: '2026-04-10',
      invoiceNumber: 'INV-001',
      entityCode: 'cornerstore',
      bankAccountNumber: '02-0108-0436551-000',
      categoryCode: 'outflows_ap',
      suggestedStatus: 'awaiting_payment',
      suggestedWeekEnding: '2026-04-10',
      statusReason: 'Invoice raised but no payment confirmation in document',
      paymentTerms: '60 days',
      confidence: 0.95,
      rawText: 'Source text excerpt',
    }

    const result = ExtractionItem.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('accepts null optional fields', () => {
    const item = {
      counterparty: null,
      amount: null,
      expectedDate: null,
      invoiceNumber: null,
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedStatus: null,
      suggestedWeekEnding: null,
      statusReason: null,
      paymentTerms: null,
      confidence: 0.5,
      rawText: 'some text',
    }

    const result = ExtractionItem.safeParse(item)
    expect(result.success).toBe(true)
  })

  it('rejects confidence outside 0-1 range', () => {
    const item = {
      counterparty: 'Test',
      amount: 100,
      expectedDate: null,
      invoiceNumber: null,
      entityCode: null,
      bankAccountNumber: null,
      categoryCode: null,
      suggestedStatus: null,
      suggestedWeekEnding: null,
      statusReason: null,
      paymentTerms: null,
      confidence: 1.5,
      rawText: 'text',
    }

    const result = ExtractionItem.safeParse(item)
    expect(result.success).toBe(false)
  })
})

describe('ExtractionResult', () => {
  it('parses a full AI response', () => {
    const response = {
      classification: { documentType: 'aged_receivables', confidence: 0.9 },
      items: [{
        counterparty: 'Client A',
        amount: 5000,
        expectedDate: '2026-04-15',
        invoiceNumber: 'INV-100',
        entityCode: 'augusto',
        bankAccountNumber: '02-0108-0436455-000',
        categoryCode: 'inflows_ar',
        suggestedStatus: 'awaiting_payment',
        suggestedWeekEnding: '2026-04-17',
        statusReason: 'Outstanding invoice in aged receivables report',
        paymentTerms: '30 days',
        confidence: 0.92,
        rawText: 'Client A | INV-100 | $5,000 | 30 days',
      }],
    }

    const result = ExtractionResult.safeParse(response)
    expect(result.success).toBe(true)
  })
})

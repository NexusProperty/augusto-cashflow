import { describe, it, expect } from 'vitest'
import { buildContextPrompt } from '@/lib/documents/extraction-prompt'

describe('buildContextPrompt', () => {
  it('includes filename in the prompt', () => {
    const prompt = buildContextPrompt('test-invoice.pdf', 'ENTITIES:\n- augusto')
    expect(prompt).toContain('test-invoice.pdf')
  })

  it('includes reference data block', () => {
    const refBlock = 'ENTITIES:\n- augusto\n\nCATEGORIES:\n- inflows_ar'
    const prompt = buildContextPrompt('file.xlsx', refBlock)
    expect(prompt).toContain('ENTITIES:')
    expect(prompt).toContain('inflows_ar')
  })

  it('includes the expanded output schema fields', () => {
    const prompt = buildContextPrompt('file.pdf', '')
    expect(prompt).toContain('entityCode')
    expect(prompt).toContain('bankAccountNumber')
    expect(prompt).toContain('categoryCode')
    expect(prompt).toContain('suggestedStatus')
    expect(prompt).toContain('suggestedWeekEnding')
    expect(prompt).toContain('statusReason')
  })

  it('includes status inference rules', () => {
    const prompt = buildContextPrompt('file.pdf', '')
    expect(prompt).toContain('aged_receivables')
    expect(prompt).toContain('awaiting_payment')
    expect(prompt).toContain('bank_statement')
    expect(prompt).toContain('remittance_received')
  })
})

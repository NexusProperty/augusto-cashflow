import { describe, it, expect } from 'vitest'
import { mapExcelStage } from '@/lib/pipeline/excel-import'

describe('mapExcelStage', () => {
  it('maps "Confirmed" to confirmed', () => {
    expect(mapExcelStage('Confirmed')).toBe('confirmed')
  })
  it('maps "Awaiting budget approval from client" to awaiting_approval', () => {
    expect(mapExcelStage('Awaiting budget approval from client')).toBe('awaiting_approval')
    expect(mapExcelStage('Awaiting budget approval from clien')).toBe('awaiting_approval')
  })
  it('maps "Upcoming work, spoken to client" to upcoming', () => {
    expect(mapExcelStage('Upcoming work, spoken to client,  but no formal budget')).toBe('upcoming')
    expect(mapExcelStage('Upcoming work, spoken to client, but no formal')).toBe('upcoming')
  })
  it('maps "Speculative" to speculative', () => {
    expect(mapExcelStage('Speculative')).toBe('speculative')
  })
  it('maps "DECLINED" to declined', () => {
    expect(mapExcelStage('DECLINED')).toBe('declined')
  })
  it('defaults to speculative for unknown stages', () => {
    expect(mapExcelStage('Something else')).toBe('speculative')
    expect(mapExcelStage('')).toBe('speculative')
  })
})

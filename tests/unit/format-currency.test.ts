import { describe, it, expect } from 'vitest'
import { formatCurrencyCompact } from '@/lib/utils'

describe('formatCurrencyCompact', () => {
  it('returns empty string for zero', () => {
    expect(formatCurrencyCompact(0)).toBe('')
  })
  it('formats small amounts as exact numbers', () => {
    expect(formatCurrencyCompact(500)).toBe('$500')
    expect(formatCurrencyCompact(999)).toBe('$999')
  })
  it('formats thousands with K suffix', () => {
    expect(formatCurrencyCompact(1000)).toBe('$1K')
    expect(formatCurrencyCompact(25000)).toBe('$25K')
    expect(formatCurrencyCompact(596208)).toBe('$596K')
  })
  it('formats millions with M suffix', () => {
    expect(formatCurrencyCompact(1000000)).toBe('$1.0M')
    expect(formatCurrencyCompact(1200000)).toBe('$1.2M')
  })
  it('handles negative amounts', () => {
    expect(formatCurrencyCompact(-303792)).toBe('-$304K')
    expect(formatCurrencyCompact(-511097)).toBe('-$511K')
    expect(formatCurrencyCompact(-500)).toBe('-$500')
  })
})

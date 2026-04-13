import { describe, it, expect } from 'vitest'
import { UpdateLineAmountsSchema } from '@/app/(app)/forecast/schemas'

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

describe('UpdateLineAmountsSchema', () => {
  it('accepts a valid single update', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [{ id: UUID_A, amount: 1000 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updates).toHaveLength(1)
      expect(result.data.updates[0]?.amount).toBe(1000)
    }
  })

  it('accepts a batch of 500 updates (max boundary)', () => {
    const updates = Array.from({ length: 500 }, (_, i) => ({
      id: `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`,
      amount: i * 10,
    }))
    const result = UpdateLineAmountsSchema.safeParse({ updates })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updates).toHaveLength(500)
    }
  })

  it('rejects an empty array', () => {
    const result = UpdateLineAmountsSchema.safeParse({ updates: [] })
    expect(result.success).toBe(false)
  })

  it('rejects 501 updates (over max boundary)', () => {
    const updates = Array.from({ length: 501 }, (_, i) => ({
      id: `11111111-1111-1111-1111-${String(i).padStart(12, '0')}`,
      amount: i,
    }))
    const result = UpdateLineAmountsSchema.safeParse({ updates })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID id', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [{ id: 'not-a-uuid', amount: 100 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-numeric amount that cannot be coerced', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [{ id: UUID_A, amount: 'not-a-number' }],
    })
    expect(result.success).toBe(false)
  })

  it('coerces numeric string amount to number', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [{ id: UUID_A, amount: '1500' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updates[0]?.amount).toBe(1500)
      expect(typeof result.data.updates[0]?.amount).toBe('number')
    }
  })

  it('accepts negative amounts', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [{ id: UUID_A, amount: -2500 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updates[0]?.amount).toBe(-2500)
    }
  })

  it('accepts decimal amounts', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [{ id: UUID_A, amount: 1234.56 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updates[0]?.amount).toBeCloseTo(1234.56)
    }
  })

  it('rejects missing updates field', () => {
    const result = UpdateLineAmountsSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts a batch of mixed valid updates', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [
        { id: UUID_A, amount: 100 },
        { id: UUID_B, amount: '200' },
        { id: UUID_A, amount: -50.25 },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.updates).toHaveLength(3)
      expect(result.data.updates[1]?.amount).toBe(200)
    }
  })

  it('rejects when an item is missing id', () => {
    const result = UpdateLineAmountsSchema.safeParse({
      updates: [{ amount: 100 }],
    })
    expect(result.success).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { isAllowedGroup } from '@/lib/auth/scope'
import { AUGUSTO_GROUP_ID, COACHMATE_GROUP_ID } from '@/lib/types'

describe('isAllowedGroup', () => {
  it('accepts Augusto group', () => {
    expect(isAllowedGroup(AUGUSTO_GROUP_ID)).toBe(true)
  })

  it('accepts Coachmate group', () => {
    expect(isAllowedGroup(COACHMATE_GROUP_ID)).toBe(true)
  })

  it('rejects unknown group', () => {
    expect(isAllowedGroup('00000000-0000-0000-0000-000000000000')).toBe(false)
  })

  it('rejects null', () => {
    expect(isAllowedGroup(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isAllowedGroup(undefined)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isAllowedGroup('')).toBe(false)
  })
})

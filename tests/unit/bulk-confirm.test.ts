import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock modules before importing
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'user-1' }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('bulkConfirmExtractions', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('rejects empty extraction IDs array', async () => {
    const { bulkConfirmExtractions } = await import('@/app/(app)/documents/actions')
    const result = await bulkConfirmExtractions([])
    expect(result.error).toBe('No extraction IDs provided')
  })
})

describe('undoAutoConfirm', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('is exported as a function', async () => {
    const actions = await import('@/app/(app)/documents/actions')
    expect(typeof actions.undoAutoConfirm).toBe('function')
  })
})

import { describe, it, expect } from 'vitest'
import { loadPipelineEntities, loadEntities } from '@/lib/pipeline/queries'

/**
 * Fixture: full entity set for the Augusto group. `is_pipeline_entity` is
 * false for AGC and ENT (per migration 020) and true for the rest.
 */
const ALL_ENTITIES = [
  { id: 'e-aug', name: 'Augusto', code: 'AUG', group_id: 'g-aug', is_active: true, is_pipeline_entity: true },
  { id: 'e-cnr', name: 'Cornerstore', code: 'CNR', group_id: 'g-aug', is_active: true, is_pipeline_entity: true },
  { id: 'e-bal', name: 'Ballyhoo', code: 'BAL', group_id: 'g-aug', is_active: true, is_pipeline_entity: true },
  { id: 'e-dd', name: 'Dark Doris', code: 'DD', group_id: 'g-aug', is_active: true, is_pipeline_entity: true },
  { id: 'e-wrs', name: 'Wrestler', code: 'WRS', group_id: 'g-aug', is_active: true, is_pipeline_entity: true },
  { id: 'e-agc', name: 'Agency', code: 'AGC', group_id: 'g-aug', is_active: true, is_pipeline_entity: false },
  { id: 'e-ent', name: 'Entertainment', code: 'ENT', group_id: 'g-aug', is_active: true, is_pipeline_entity: false },
]

type EqFilter = { column: string; value: unknown }

/**
 * Minimal fake Supabase client that records every `.eq(...)` call on the
 * `entities` table and returns rows matching the recorded filters from a
 * fixed fixture. Good enough to verify the query shape of
 * `loadPipelineEntities` / `loadEntities` without pulling in the full
 * Supabase client.
 */
function makeFakeSupabase(rows = ALL_ENTITIES) {
  const calls: EqFilter[] = []

  const builder = {
    eq(column: string, value: unknown) {
      calls.push({ column, value })
      return builder
    },
    order(_column: string) {
      const filtered = rows.filter((row) =>
        calls.every((c) => (row as unknown as Record<string, unknown>)[c.column] === c.value),
      )
      return Promise.resolve({ data: filtered, error: null })
    },
  }

  const client = {
    from(table: string) {
      if (table !== 'entities') throw new Error(`unexpected table: ${table}`)
      return {
        select(_cols: string) {
          return builder
        },
      }
    },
  }

  return { client, calls }
}

describe('loadPipelineEntities', () => {
  it('returns only entities with is_pipeline_entity = true', async () => {
    const { client } = makeFakeSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadPipelineEntities(client as any, 'g-aug')
    const codes = result.map((e) => e.code).sort()
    expect(codes).toEqual(['AUG', 'BAL', 'CNR', 'DD', 'WRS'])
  })

  it('excludes AGC and ENT', async () => {
    const { client } = makeFakeSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadPipelineEntities(client as any, 'g-aug')
    const codes = result.map((e) => e.code)
    expect(codes).not.toContain('AGC')
    expect(codes).not.toContain('ENT')
  })

  it('passes is_pipeline_entity = true into the query', async () => {
    const { client, calls } = makeFakeSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadPipelineEntities(client as any, 'g-aug')
    expect(calls).toContainEqual({ column: 'is_pipeline_entity', value: true })
    expect(calls).toContainEqual({ column: 'is_active', value: true })
    expect(calls).toContainEqual({ column: 'group_id', value: 'g-aug' })
  })

  it('loadEntities (non-pipeline helper) still returns AGC and ENT', async () => {
    // Guard rail: other modules (bank accounts, forecast) rely on the
    // unfiltered helper continuing to expose every active entity.
    const { client, calls } = makeFakeSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await loadEntities(client as any, 'g-aug')
    const codes = result.map((e) => e.code).sort()
    expect(codes).toEqual(['AGC', 'AUG', 'BAL', 'CNR', 'DD', 'ENT', 'WRS'])
    expect(calls).not.toContainEqual({ column: 'is_pipeline_entity', value: true })
  })
})

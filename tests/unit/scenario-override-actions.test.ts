import { describe, it, expect } from 'vitest'
import {
  CreateScenarioOverrideSchema as CreateSchema,
  UpdateScenarioOverrideSchema as UpdateSchema,
  rowFromParsed,
} from '@/app/(app)/forecast/overrides/schemas'

const SCENARIO = '11111111-1111-1111-1111-111111111111'
const TARGET = '22222222-2222-2222-2222-222222222222'
const ID = '33333333-3333-3333-3333-333333333333'

describe('scenario override schemas', () => {
  it('accepts a minimal pipeline_item override', () => {
    const parsed = CreateSchema.safeParse({
      scenarioId: SCENARIO,
      targetType: 'pipeline_item',
      targetId: TARGET,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.overrideConfidence).toBeNull()
      expect(parsed.data.overrideAmount).toBeNull()
      expect(parsed.data.overrideWeekShift).toBe(0)
      expect(parsed.data.isExcluded).toBe(false)
    }
  })

  it('coerces form string numbers to numbers', () => {
    const parsed = CreateSchema.safeParse({
      scenarioId: SCENARIO,
      targetType: 'recurring_rule',
      targetId: TARGET,
      overrideConfidence: '80',
      overrideAmount: '12500.50',
      overrideWeekShift: '-2',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.overrideConfidence).toBe(80)
      expect(parsed.data.overrideAmount).toBe(12500.5)
      expect(parsed.data.overrideWeekShift).toBe(-2)
    }
  })

  it('treats empty strings as null for nullable numeric fields', () => {
    const parsed = CreateSchema.safeParse({
      scenarioId: SCENARIO,
      targetType: 'pipeline_item',
      targetId: TARGET,
      overrideConfidence: '',
      overrideAmount: '',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.overrideConfidence).toBeNull()
      expect(parsed.data.overrideAmount).toBeNull()
    }
  })

  it('treats "on" checkbox value as true', () => {
    const parsed = CreateSchema.safeParse({
      scenarioId: SCENARIO,
      targetType: 'pipeline_item',
      targetId: TARGET,
      isExcluded: 'on',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.isExcluded).toBe(true)
  })

  it('rejects confidence > 100', () => {
    const parsed = CreateSchema.safeParse({
      scenarioId: SCENARIO,
      targetType: 'pipeline_item',
      targetId: TARGET,
      overrideConfidence: '150',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects invalid target_type', () => {
    const parsed = CreateSchema.safeParse({
      scenarioId: SCENARIO,
      targetType: 'forecast_line',
      targetId: TARGET,
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects non-uuid ids', () => {
    const parsed = CreateSchema.safeParse({
      scenarioId: 'not-a-uuid',
      targetType: 'pipeline_item',
      targetId: TARGET,
    })
    expect(parsed.success).toBe(false)
  })

  it('UpdateSchema requires an id', () => {
    const missingId = UpdateSchema.safeParse({
      scenarioId: SCENARIO,
      targetType: 'pipeline_item',
      targetId: TARGET,
    })
    expect(missingId.success).toBe(false)

    const ok = UpdateSchema.safeParse({
      id: ID,
      scenarioId: SCENARIO,
      targetType: 'pipeline_item',
      targetId: TARGET,
    })
    expect(ok.success).toBe(true)
  })

  it('rowFromParsed maps camelCase to snake_case DB columns', () => {
    const parsed = CreateSchema.parse({
      scenarioId: SCENARIO,
      targetType: 'pipeline_item',
      targetId: TARGET,
      overrideConfidence: '95',
      overrideAmount: '1000',
      overrideWeekShift: '1',
      isExcluded: 'true',
    })
    const row = rowFromParsed(parsed)
    expect(row).toEqual({
      scenario_id: SCENARIO,
      target_type: 'pipeline_item',
      target_id: TARGET,
      override_confidence: 95,
      override_amount: 1000,
      override_week_shift: 1,
      is_excluded: true,
    })
  })
})

import { z } from 'zod'

export const OverrideAmountBounds = { min: -1_000_000_000, max: 1_000_000_000 } as const
// ±2 years of weekly periods
export const WeekShiftBounds = { min: -104, max: 104 } as const

export const TargetType = z.enum(['pipeline_item', 'recurring_rule'])

const BaseFields = {
  scenarioId: z.string().uuid(),
  targetType: TargetType,
  targetId: z.string().uuid(),
  overrideConfidence: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
      z.number().int().min(0).max(100).nullable(),
    )
    .default(null),
  overrideAmount: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
      z.number().min(OverrideAmountBounds.min).max(OverrideAmountBounds.max).nullable(),
    )
    .default(null),
  overrideWeekShift: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
      z.number().int().min(WeekShiftBounds.min).max(WeekShiftBounds.max),
    )
    .default(0),
  isExcluded: z
    .preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())
    .default(false),
}

export const CreateScenarioOverrideSchema = z.object(BaseFields)
export const UpdateScenarioOverrideSchema = z.object({ id: z.string().uuid(), ...BaseFields })

export function rowFromParsed(p: z.infer<typeof CreateScenarioOverrideSchema>) {
  return {
    scenario_id: p.scenarioId,
    target_type: p.targetType,
    target_id: p.targetId,
    override_confidence: p.overrideConfidence,
    override_amount: p.overrideAmount,
    override_week_shift: p.overrideWeekShift,
    is_excluded: p.isExcluded,
  }
}

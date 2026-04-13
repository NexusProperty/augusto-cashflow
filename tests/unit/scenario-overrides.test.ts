import { describe, it, expect } from 'vitest'
import { applyScenarioOverrides } from '@/lib/forecast/engine'
import type { ForecastLine, Period, ScenarioOverride } from '@/lib/types'

const period = (id: string, weekEnding: string): Period => ({ id, weekEnding, isActual: false })

function line(overrides: Partial<ForecastLine> & { id: string; periodId: string }): ForecastLine {
  return {
    entityId: 'e1',
    categoryId: 'c1',
    amount: 10_000,
    confidence: 80,
    source: 'pipeline',
    counterparty: null,
    notes: null,
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'confirmed',
    ...overrides,
  }
}

function override(partial: Partial<ScenarioOverride>): ScenarioOverride {
  return {
    id: `o-${Math.random()}`,
    scenarioId: 's1',
    targetType: 'pipeline_item',
    targetId: 'p1',
    overrideConfidence: null,
    overrideAmount: null,
    overrideWeekShift: 0,
    isExcluded: false,
    ...partial,
  }
}

const periods = [
  period('p1', '2026-04-10'),
  period('p2', '2026-04-17'),
  period('p3', '2026-04-24'),
]

describe('applyScenarioOverrides', () => {
  it('returns original lines when no overrides provided', () => {
    const lines = [line({ id: 'l1', periodId: 'p1', sourcePipelineProjectId: 'p1' })]
    const result = applyScenarioOverrides(lines, [], periods)
    expect(result.lines).toEqual(lines)
    expect(result.overriddenIds.size).toBe(0)
  })

  it('excludes lines when is_excluded=true', () => {
    const lines = [
      line({ id: 'l1', periodId: 'p1', sourcePipelineProjectId: 'p1' }),
      line({ id: 'l2', periodId: 'p1', sourcePipelineProjectId: 'other' }),
    ]
    const result = applyScenarioOverrides(
      lines,
      [override({ targetType: 'pipeline_item', targetId: 'p1', isExcluded: true })],
      periods,
    )
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].id).toBe('l2')
    expect(result.overriddenIds.has('l1')).toBe(true)
  })

  it('overrides amount', () => {
    const lines = [line({ id: 'l1', periodId: 'p1', sourcePipelineProjectId: 'p1', amount: 10_000 })]
    const result = applyScenarioOverrides(
      lines,
      [override({ targetId: 'p1', overrideAmount: 25_000 })],
      periods,
    )
    expect(result.lines[0].amount).toBe(25_000)
  })

  it('overrides confidence and marks it in confidenceOverriddenIds', () => {
    const lines = [line({ id: 'l1', periodId: 'p1', sourcePipelineProjectId: 'p1', confidence: 50 })]
    const result = applyScenarioOverrides(
      lines,
      [override({ targetId: 'p1', overrideConfidence: 100 })],
      periods,
    )
    expect(result.lines[0].confidence).toBe(100)
    expect(result.confidenceOverriddenIds.has('l1')).toBe(true)
  })

  it('shifts periodId forward by overrideWeekShift', () => {
    const lines = [line({ id: 'l1', periodId: 'p1', sourcePipelineProjectId: 'p1' })]
    const result = applyScenarioOverrides(
      lines,
      [override({ targetId: 'p1', overrideWeekShift: 2 })],
      periods,
    )
    expect(result.lines[0].periodId).toBe('p3')
  })

  it('drops lines shifted out of window', () => {
    const lines = [line({ id: 'l1', periodId: 'p3', sourcePipelineProjectId: 'p1' })]
    const result = applyScenarioOverrides(
      lines,
      [override({ targetId: 'p1', overrideWeekShift: 5 })],
      periods,
    )
    expect(result.lines).toHaveLength(0)
    expect(result.overriddenIds.has('l1')).toBe(true)
  })

  it('matches recurring_rule overrides by sourceRuleId', () => {
    const lines = [
      line({ id: 'l1', periodId: 'p1', sourceRuleId: 'r1' }),
      line({ id: 'l2', periodId: 'p1', sourceRuleId: 'r2' }),
    ]
    const result = applyScenarioOverrides(
      lines,
      [override({ targetType: 'recurring_rule', targetId: 'r1', isExcluded: true })],
      periods,
    )
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].id).toBe('l2')
  })

  it('applies multiple override fields together', () => {
    const lines = [line({ id: 'l1', periodId: 'p1', sourcePipelineProjectId: 'p1' })]
    const result = applyScenarioOverrides(
      lines,
      [
        override({
          targetId: 'p1',
          overrideAmount: 50_000,
          overrideConfidence: 95,
          overrideWeekShift: 1,
        }),
      ],
      periods,
    )
    expect(result.lines[0].amount).toBe(50_000)
    expect(result.lines[0].confidence).toBe(95)
    expect(result.lines[0].periodId).toBe('p2')
  })

  it('leaves unmatched lines untouched', () => {
    const lines = [line({ id: 'l1', periodId: 'p1', sourcePipelineProjectId: null, sourceRuleId: null })]
    const result = applyScenarioOverrides(
      lines,
      [override({ targetId: 'p1', overrideAmount: 99_999 })],
      periods,
    )
    expect(result.lines[0].amount).toBe(10_000)
    expect(result.overriddenIds.size).toBe(0)
  })
})

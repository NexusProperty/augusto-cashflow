import type { PipelineProjectRow, BUSummaryRow, RevenueTarget } from './types'
import { PNL_WEIGHT } from './types'
import type { PipelineStage } from '@/lib/types'

interface EntityInfo {
  id: string
  name: string
}

export function computeBUSummary(
  projects: PipelineProjectRow[],
  entities: EntityInfo[],
  targets: RevenueTarget[],
  months: string[],
): BUSummaryRow[] {
  return entities.map((entity) => {
    const entityProjects = projects.filter(
      (p) => p.entityId === entity.id && p.stage !== 'declined',
    )

    const confirmedAndAwaiting = months.map((m) =>
      sumAllocationsForMonth(entityProjects, m, ['confirmed', 'awaiting_approval']),
    )
    const upcomingAndSpeculative = months.map((m) =>
      sumAllocationsForMonth(entityProjects, m, ['upcoming', 'speculative']),
    )
    const totalForecast = months.map((_, i) => confirmedAndAwaiting[i] + upcomingAndSpeculative[i])

    const target = months.map((m) => {
      const t = targets.find((t) => t.entityId === entity.id && t.month === m)
      return t?.targetAmount ?? 0
    })

    const variance = months.map((_, i) => confirmedAndAwaiting[i] - target[i])

    const pnlForecast = months.map((m) =>
      entityProjects.reduce((sum, proj) => {
        const alloc = proj.allocations.find((a) => a.month === m)
        if (!alloc) return sum
        const weight = PNL_WEIGHT[proj.stage as PipelineStage] ?? 0
        return sum + alloc.amount * weight
      }, 0),
    )

    return {
      entityId: entity.id,
      entityName: entity.name,
      confirmedAndAwaiting,
      upcomingAndSpeculative,
      totalForecast,
      target,
      variance,
      pnlForecast,
    }
  })
}

function sumAllocationsForMonth(
  projects: PipelineProjectRow[],
  month: string,
  stages: PipelineStage[],
): number {
  return projects
    .filter((p) => stages.includes(p.stage as PipelineStage))
    .reduce((sum, proj) => {
      const alloc = proj.allocations.find((a) => a.month === month)
      return sum + (alloc?.amount ?? 0)
    }, 0)
}

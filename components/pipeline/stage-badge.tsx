'use client'

import { cn } from '@/lib/utils'
import type { PipelineStage } from '@/lib/types'
import { STAGE_DISPLAY } from '@/lib/pipeline/types'

const colorClasses: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  zinc: 'bg-zinc-50 text-zinc-500 ring-zinc-500/10',
}

export function StageBadge({ stage, className }: { stage: PipelineStage; className?: string }) {
  const display = STAGE_DISPLAY[stage]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        colorClasses[display.color] ?? colorClasses.zinc,
        className,
      )}
    >
      {display.label}
    </span>
  )
}

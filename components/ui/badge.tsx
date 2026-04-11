import { cn } from '@/lib/utils'

type BadgeVariant = 'manual' | 'document' | 'recurring' | 'pipeline' | 'success' | 'warning' | 'danger'

const variants: Record<BadgeVariant, string> = {
  manual: 'bg-[#94a3b8]/10 text-[#94a3b8]',
  document: 'bg-[#6366f1]/10 text-[#6366f1]',
  recurring: 'bg-[#10b981]/10 text-[#10b981]',
  pipeline: 'bg-[#f59e0b]/10 text-[#f59e0b]',
  success: 'bg-[#4ade80]/10 text-[#4ade80]',
  warning: 'bg-[#fbbf24]/10 text-[#fbbf24]',
  danger: 'bg-[#f87171]/10 text-[#f87171]',
}

export function Badge({ variant = 'manual', className, children }: {
  variant?: BadgeVariant
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}

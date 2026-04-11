import { cn } from '@/lib/utils'

type BadgeVariant = 'manual' | 'document' | 'recurring' | 'pipeline' | 'success' | 'warning' | 'danger'

const variants: Record<BadgeVariant, string> = {
  manual: 'bg-zinc-100 text-zinc-600',
  document: 'bg-indigo-50 text-indigo-700',
  recurring: 'bg-emerald-50 text-emerald-700',
  pipeline: 'bg-amber-50 text-amber-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
}

export function Badge({ variant = 'manual', className, children }: {
  variant?: BadgeVariant
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', variants[variant], className)}>
      {children}
    </span>
  )
}

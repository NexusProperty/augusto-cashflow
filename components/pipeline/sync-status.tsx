'use client'

import { cn } from '@/lib/utils'

export function SyncStatus({ isSynced, className }: { isSynced: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        isSynced ? 'text-emerald-600' : 'text-zinc-400',
        className,
      )}
      title={isSynced ? 'Syncing to forecast' : 'Sync paused'}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isSynced ? 'bg-emerald-500' : 'bg-zinc-300')} />
      {isSynced ? 'Synced' : 'Paused'}
    </span>
  )
}

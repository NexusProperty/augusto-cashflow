'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Tab {
  label: string
  href: string
}

export function Tabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname()

  return (
    <div className="flex gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'rounded-t-md px-5 py-2 text-sm font-medium transition-colors',
            pathname === tab.href
              ? 'border border-b-0 border-border-active bg-[#1e1b4b] text-[#a5b4fc]'
              : 'border border-b-0 border-border bg-surface-raised text-text-muted hover:text-text-secondary'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

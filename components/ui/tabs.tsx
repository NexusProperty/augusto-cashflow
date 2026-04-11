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
    <div className="flex gap-6 border-b border-zinc-200">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            '-mb-px border-b-2 pb-3 text-sm font-medium transition-colors',
            pathname === tab.href
              ? 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

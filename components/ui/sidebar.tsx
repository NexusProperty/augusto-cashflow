'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Forecast', href: '/forecast', icon: '📊' },
  { label: 'Documents', href: '/documents', icon: '📄' },
  { label: 'Settings', href: '/settings', icon: '⚙' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-surface-raised">
      <div className="border-b border-border px-4 py-4">
        <h1 className="text-sm font-semibold text-text-primary">Augusto Group</h1>
        <p className="text-xs text-text-muted">Cash Flow Forecast</p>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-brand/10 text-brand'
                : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}

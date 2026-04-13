'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" />
    </svg>
  )
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
    </svg>
  )
}

function PipelineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M12.577 4.878a.75.75 0 0 1 .919-.53l4.78 1.281a.75.75 0 0 1 .531.919l-1.281 4.78a.75.75 0 0 1-1.449-.387l.81-3.022a19.407 19.407 0 0 0-5.594 5.203.75.75 0 0 1-1.139.093L7 10.06l-4.72 4.72a.75.75 0 0 1-1.06-1.061l5.25-5.25a.75.75 0 0 1 1.06 0l3.074 3.073a20.923 20.923 0 0 1 5.545-5.332l-3.07-.822a.75.75 0 0 1-.502-.51Z" clipRule="evenodd" />
    </svg>
  )
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
    </svg>
  )
}

const topNavItems = [
  { label: 'Documents', href: '/documents', icon: DocumentIcon },
]

const forecastSubItems = [
  { label: 'Overview', href: '/forecast' },
  { label: 'Detail', href: '/forecast/detail' },
  { label: 'Compare', href: '/forecast/compare' },
  { label: 'Overrides', href: '/forecast/overrides' },
]

const pipelineSubItems = [
  { label: 'Overview', href: '/pipeline' },
  { label: 'Summary', href: '/pipeline/summary' },
  { label: 'Targets', href: '/pipeline/targets' },
]

const bottomNavItems = [
  { label: 'Settings', href: '/settings', icon: CogIcon },
]

export function Sidebar() {
  const pathname = usePathname()
  const forecastActive = pathname.startsWith('/forecast')
  const pipelineActive = pathname.startsWith('/pipeline')

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-zinc-200 bg-white">
      <div className="px-6 py-5">
        <h1 className="text-base font-semibold text-zinc-900">Augusto Group</h1>
        <p className="text-xs text-zinc-500">Cash Flow Forecast</p>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {/* Forecast section */}
        <Link
          href="/forecast"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            forecastActive
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
          )}
        >
          <ChartIcon className={cn('h-5 w-5', forecastActive ? 'text-zinc-900' : 'text-zinc-400')} />
          Forecast
        </Link>
        {forecastActive && (
          <div className="ml-8 space-y-0.5">
            {forecastSubItems.map((sub) => {
              const subActive = pathname === sub.href
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={cn(
                    'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                    subActive
                      ? 'font-medium text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900'
                  )}
                >
                  {sub.label}
                </Link>
              )
            })}
          </div>
        )}

        {topNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              )}
            >
              <Icon className={cn('h-5 w-5', active ? 'text-zinc-900' : 'text-zinc-400')} />
              {item.label}
            </Link>
          )
        })}

        {/* Pipeline section */}
        <Link
          href="/pipeline"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            pipelineActive
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
          )}
        >
          <PipelineIcon className={cn('h-5 w-5', pipelineActive ? 'text-zinc-900' : 'text-zinc-400')} />
          Pipeline
        </Link>
        {pipelineActive && (
          <div className="ml-8 space-y-0.5">
            {pipelineSubItems.map((sub) => {
              const subActive = pathname === sub.href
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  className={cn(
                    'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                    subActive
                      ? 'font-medium text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900'
                  )}
                >
                  {sub.label}
                </Link>
              )
            })}
          </div>
        )}

        {bottomNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              )}
            >
              <Icon className={cn('h-5 w-5', active ? 'text-zinc-900' : 'text-zinc-400')} />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

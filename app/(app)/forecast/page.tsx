import { Tabs } from '@/components/ui/tabs'

const forecastTabs = [
  { label: 'Augusto Group', href: '/forecast' },
  { label: 'Coachmate', href: '/forecast/coachmate' },
  { label: 'Intercompany', href: '/forecast/intercompany' },
]

export default function ForecastPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cash Flow Forecast</h1>
      </div>
      <Tabs tabs={forecastTabs} />
      <div className="mt-4 rounded-lg border border-border bg-surface-raised p-8 text-center text-text-muted">
        Forecast grid — coming in Task 7
      </div>
    </div>
  )
}

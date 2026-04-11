'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Scenario {
  id: string
  name: string
  isDefault: boolean
}

export function ScenarioToolbar({ scenarios, weekRange }: {
  scenarios: Scenario[]
  weekRange: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const currentScenario = params.get('scenario') ?? scenarios.find((s) => s.isDefault)?.id ?? ''
  const weighted = params.get('weighted') !== 'false'

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.push(`?${next.toString()}`)
  }

  return (
    <div className="mt-4 flex items-center justify-between rounded-t-lg border border-b-0 border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <select
          value={currentScenario}
          onChange={(e) => setParam('scenario', e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="text-sm text-zinc-500">{weekRange}</span>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={weighted}
            onChange={(e) => setParam('weighted', String(e.target.checked))}
            className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          Weighted by confidence
        </label>
      </div>
    </div>
  )
}

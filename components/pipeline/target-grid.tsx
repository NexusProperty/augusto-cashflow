'use client'

import { useState, useTransition } from 'react'
import { getMonthLabel } from '@/lib/pipeline/fiscal-year'
import { updateTargets } from '@/app/(app)/pipeline/actions'

interface TargetGridProps {
  entities: { id: string; name: string; code: string }[]
  months: string[]
  targets: { entityId: string; month: string; targetAmount: number }[]
}

type ChangeKey = `${string}::${string}`

function makeKey(entityId: string, month: string): ChangeKey {
  return `${entityId}::${month}` as ChangeKey
}

function fmt(n: number): string {
  if (n === 0) return ''
  return n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })
}

export function TargetGrid({ entities, months, targets }: TargetGridProps) {
  const [, startTransition] = useTransition()
  const [isPending, setIsPending] = useState(false)
  const [saved, setSaved] = useState(false)

  // Build initial value map from server data
  const initialValues = new Map<ChangeKey, number>()
  for (const t of targets) {
    initialValues.set(makeKey(t.entityId, t.month), t.targetAmount)
  }

  // Track changed cells as a map of key → new value
  const [changes, setChanges] = useState<Map<ChangeKey, number>>(new Map())

  // Effective value: changed value if present, otherwise server value
  function getValue(entityId: string, month: string): number {
    const key = makeKey(entityId, month)
    return changes.has(key) ? (changes.get(key) ?? 0) : (initialValues.get(key) ?? 0)
  }

  function handleChange(entityId: string, month: string, raw: string) {
    const num = raw === '' ? 0 : parseFloat(raw)
    const value = isNaN(num) ? 0 : num
    const key = makeKey(entityId, month)
    setChanges((prev) => {
      const next = new Map(prev)
      next.set(key, value)
      return next
    })
    setSaved(false)
  }

  function handleSave() {
    if (changes.size === 0) return

    const payload = Array.from(changes.entries()).map(([key, targetAmount]) => {
      const [entityId, month] = key.split('::')
      return { entityId, month, targetAmount }
    })

    setIsPending(true)
    startTransition(async () => {
      await updateTargets({ targets: payload })
      setChanges(new Map())
      setSaved(true)
      setIsPending(false)
    })
  }

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3">
        <p className="text-xs text-zinc-500">
          {changes.size > 0
            ? `${changes.size} unsaved change${changes.size !== 1 ? 's' : ''}`
            : saved
              ? 'All changes saved'
              : 'Edit cells to update monthly revenue targets'}
        </p>
        <button
          onClick={handleSave}
          disabled={isPending || changes.size === 0}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="sticky left-0 z-20 min-w-[180px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                Entity
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="bg-zinc-50 px-2.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500"
                >
                  {getMonthLabel(m)}
                </th>
              ))}
              <th className="bg-zinc-50 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">
                Total
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100">
            {entities.length === 0 && (
              <tr>
                <td
                  colSpan={months.length + 2}
                  className="px-4 py-8 text-center text-sm text-zinc-400"
                >
                  No entities found.
                </td>
              </tr>
            )}

            {entities.map((entity) => {
              const rowTotal = months.reduce(
                (sum, m) => sum + getValue(entity.id, m),
                0,
              )

              return (
                <tr key={entity.id} className="group hover:bg-zinc-50/50">
                  {/* Entity name */}
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 group-hover:bg-zinc-50/50">
                    <span className="text-xs font-medium text-zinc-900">
                      {entity.name}
                    </span>
                    {entity.code && (
                      <span className="ml-1.5 text-xs text-zinc-400">{entity.code}</span>
                    )}
                  </td>

                  {/* Month input cells */}
                  {months.map((m) => {
                    const val = getValue(entity.id, m)
                    const key = makeKey(entity.id, m)
                    const isChanged = changes.has(key)
                    return (
                      <td key={m} className="px-1 py-1">
                        <input
                          type="number"
                          value={val === 0 ? '' : val}
                          onChange={(e) => handleChange(entity.id, m, e.target.value)}
                          placeholder="—"
                          className={`w-full min-w-[80px] rounded border-0 bg-transparent px-2 py-1 text-right text-sm tabular-nums focus:ring-1 focus:ring-zinc-300 ${
                            isChanged
                              ? 'bg-indigo-50 text-indigo-900'
                              : 'text-zinc-900'
                          } placeholder:text-zinc-300`}
                          aria-label={`${entity.name} target for ${getMonthLabel(m)}`}
                        />
                      </td>
                    )
                  })}

                  {/* Total (computed, read-only) */}
                  <td className="px-3 py-1.5 text-right tabular-nums text-sm font-medium text-zinc-900">
                    {rowTotal === 0 ? (
                      <span className="text-zinc-300">—</span>
                    ) : (
                      fmt(rowTotal)
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

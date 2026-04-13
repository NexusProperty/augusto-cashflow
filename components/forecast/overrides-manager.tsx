'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createScenarioOverride,
  deleteScenarioOverride,
  updateScenarioOverride,
} from '@/app/(app)/forecast/overrides/actions'
import { formatCurrency, cn } from '@/lib/utils'

interface ScenarioOption {
  id: string
  name: string
  isDefault: boolean
}

interface TargetOption {
  id: string
  label: string
}

type TargetType = 'pipeline_item' | 'recurring_rule'

interface OverrideRow {
  id: string
  scenarioId: string
  targetType: TargetType
  targetId: string
  overrideConfidence: number | null
  overrideAmount: number | null
  overrideWeekShift: number
  isExcluded: boolean
}

interface Props {
  scenarios: ScenarioOption[]
  overrides: OverrideRow[]
  projectOptions: TargetOption[]
  ruleOptions: TargetOption[]
  initialScenarioId: string
}

const emptyDraft: Omit<OverrideRow, 'id' | 'scenarioId'> = {
  targetType: 'pipeline_item',
  targetId: '',
  overrideConfidence: null,
  overrideAmount: null,
  overrideWeekShift: 0,
  isExcluded: false,
}

export function OverridesManager({
  scenarios,
  overrides,
  projectOptions,
  ruleOptions,
  initialScenarioId,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [scenarioId, setScenarioId] = useState<string>(initialScenarioId)
  const [editing, setEditing] = useState<OverrideRow | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState<string | null>(null)

  const scenarioName = useMemo(
    () => scenarios.find((s) => s.id === scenarioId)?.name ?? '',
    [scenarios, scenarioId],
  )

  const labelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of projectOptions) m.set(`pipeline_item:${o.id}`, o.label)
    for (const o of ruleOptions) m.set(`recurring_rule:${o.id}`, o.label)
    return m
  }, [projectOptions, ruleOptions])

  const rows = useMemo(
    () => overrides.filter((o) => o.scenarioId === scenarioId),
    [overrides, scenarioId],
  )

  function changeScenario(id: string) {
    setScenarioId(id)
    setShowAdd(false)
    setEditing(null)
    setError(null)
    const next = new URLSearchParams(searchParams.toString())
    next.set('scenario', id)
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  function resetForm() {
    setDraft(emptyDraft)
    setEditing(null)
    setShowAdd(false)
    setError(null)
  }

  function openEdit(row: OverrideRow) {
    setEditing(row)
    setShowAdd(true)
    setDraft({
      targetType: row.targetType,
      targetId: row.targetId,
      overrideConfidence: row.overrideConfidence,
      overrideAmount: row.overrideAmount,
      overrideWeekShift: row.overrideWeekShift,
      isExcluded: row.isExcluded,
    })
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    if (!draft.targetId) {
      setError('Pick a target')
      return
    }

    const fd = new FormData()
    fd.set('scenarioId', scenarioId)
    fd.set('targetType', draft.targetType)
    fd.set('targetId', draft.targetId)
    fd.set('overrideConfidence', draft.overrideConfidence !== null ? String(draft.overrideConfidence) : '')
    fd.set('overrideAmount', draft.overrideAmount !== null ? String(draft.overrideAmount) : '')
    fd.set('overrideWeekShift', String(draft.overrideWeekShift))
    fd.set('isExcluded', draft.isExcluded ? 'true' : 'false')
    if (editing) fd.set('id', editing.id)

    startTransition(async () => {
      const result = editing
        ? await updateScenarioOverride(fd)
        : await createScenarioOverride(fd)
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      resetForm()
      router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this override?')) return
    startTransition(async () => {
      const result = await deleteScenarioOverride(id)
      if ('error' in result && result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const targetOptions = draft.targetType === 'pipeline_item' ? projectOptions : ruleOptions

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => changeScenario(s.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              scenarioId === s.id
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200',
            )}
          >
            {s.name}
            {s.isDefault && <span className="ml-1 text-xs opacity-60">(base)</span>}
          </button>
        ))}
        <div className="ml-auto">
          <button
            onClick={() => {
              resetForm()
              setShowAdd(true)
            }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
          >
            + Add override
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              {editing ? 'Edit override' : `Add override to ${scenarioName}`}
            </h2>
            <button
              onClick={resetForm}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-zinc-600">
              Target type
              <select
                value={draft.targetType}
                onChange={(e) =>
                  setDraft({ ...draft, targetType: e.target.value as TargetType, targetId: '' })
                }
                className="mt-1 block w-full rounded-md border-zinc-300 text-sm"
              >
                <option value="pipeline_item">Pipeline project</option>
                <option value="recurring_rule">Recurring rule</option>
              </select>
            </label>

            <label className="text-xs font-medium text-zinc-600">
              Target
              <select
                value={draft.targetId}
                onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}
                className="mt-1 block w-full rounded-md border-zinc-300 text-sm"
              >
                <option value="">— select —</option>
                {targetOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-zinc-600">
              Override amount (blank = no change)
              <input
                type="number"
                step="0.01"
                value={draft.overrideAmount ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    overrideAmount: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="mt-1 block w-full rounded-md border-zinc-300 text-sm"
              />
            </label>

            <label className="text-xs font-medium text-zinc-600">
              Override confidence 0–100 (blank = no change)
              <input
                type="number"
                min={0}
                max={100}
                value={draft.overrideConfidence ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    overrideConfidence: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="mt-1 block w-full rounded-md border-zinc-300 text-sm"
              />
            </label>

            <label className="text-xs font-medium text-zinc-600">
              Week shift (±N weeks)
              <input
                type="number"
                value={draft.overrideWeekShift}
                onChange={(e) =>
                  setDraft({ ...draft, overrideWeekShift: Number(e.target.value) || 0 })
                }
                className="mt-1 block w-full rounded-md border-zinc-300 text-sm"
              />
            </label>

            <label className="flex items-end gap-2 text-xs font-medium text-zinc-600">
              <input
                type="checkbox"
                checked={draft.isExcluded}
                onChange={(e) => setDraft({ ...draft, isExcluded: e.target.checked })}
                className="rounded border-zinc-300"
              />
              Exclude line from this scenario
            </label>
          </div>

          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : editing ? 'Save' : 'Create'}
            </button>
            <button
              onClick={resetForm}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-300 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <th className="px-4 py-2">Target</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Confidence</th>
              <th className="px-4 py-2">Week shift</th>
              <th className="px-4 py-2">Excluded</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No overrides for {scenarioName}. Click "+ Add override" to create one.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="px-4 py-2 text-zinc-900">
                  <div className="text-xs font-medium uppercase text-zinc-400">
                    {row.targetType === 'pipeline_item' ? 'Pipeline' : 'Recurring'}
                  </div>
                  {labelMap.get(`${row.targetType}:${row.targetId}`) ?? row.targetId}
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {row.overrideAmount !== null ? formatCurrency(row.overrideAmount) : '—'}
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {row.overrideConfidence !== null ? `${row.overrideConfidence}%` : '—'}
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {row.overrideWeekShift !== 0 ? `${row.overrideWeekShift > 0 ? '+' : ''}${row.overrideWeekShift}` : '—'}
                </td>
                <td className="px-4 py-2">
                  {row.isExcluded ? (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      Excluded
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => openEdit(row)}
                    className="mr-2 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(row.id)}
                    disabled={isPending}
                    className="text-xs font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

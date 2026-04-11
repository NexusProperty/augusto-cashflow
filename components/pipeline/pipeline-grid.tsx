'use client'

import { Fragment, useState, useEffect, useRef, useTransition, memo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getMonthLabel } from '@/lib/pipeline/fiscal-year'
import { updateAllocations, updateProjectStage, deleteProject, toggleProjectSync } from '@/app/(app)/pipeline/actions'
import { StageBadge } from '@/components/pipeline/stage-badge'
import { SyncStatus } from '@/components/pipeline/sync-status'
import { ProjectDrawer } from '@/components/pipeline/project-drawer'
import type { PipelineProjectRow, PipelineClient } from '@/lib/pipeline/types'
import type { PipelineStage } from '@/lib/types'

interface PipelineGridProps {
  projects: PipelineProjectRow[]
  clients: PipelineClient[]
  entities: { id: string; name: string; code: string }[]
  months: string[]
  selectedEntityId: string
}

const STAGES: { value: PipelineStage; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'speculative', label: 'Speculative' },
  { value: 'declined', label: 'Declined' },
]

function formatAmount(n: number): string {
  if (n === 0) return ''
  return n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })
}

// ---------------------------------------------------------------------------
// Inline amount cell
// ---------------------------------------------------------------------------

const AmountCell = memo(function AmountCell({
  projectId,
  month,
  value,
  onSave,
}: {
  projectId: string
  month: string
  value: number
  onSave: (projectId: string, month: string, amount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft }, [draft])

  if (editing) {
    return (
      <td className="px-1 py-1">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const num = parseFloat(draftRef.current)
            if (!isNaN(num)) onSave(projectId, month, num)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full min-w-[80px] rounded border border-indigo-500 bg-white px-2 py-0.5 text-right text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoFocus
        />
      </td>
    )
  }

  return (
    <td
      className="cursor-text px-2.5 py-1.5 text-right text-sm tabular-nums hover:bg-zinc-50"
      onClick={() => {
        setDraft(value === 0 ? '' : String(value))
        setEditing(true)
      }}
    >
      {value === 0 ? (
        <span className="text-zinc-300">—</span>
      ) : (
        <span className="text-zinc-900">{formatAmount(value)}</span>
      )}
    </td>
  )
})

// ---------------------------------------------------------------------------
// Main grid
// ---------------------------------------------------------------------------

export function PipelineGrid({
  projects,
  clients,
  entities,
  months,
  selectedEntityId,
}: PipelineGridProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Group projects by client name
  const byClient = new Map<string, PipelineProjectRow[]>()
  for (const proj of projects) {
    const key = proj.clientName
    if (!byClient.has(key)) byClient.set(key, [])
    byClient.get(key)!.push(proj)
  }
  const clientGroups = Array.from(byClient.entries()).sort(([a], [b]) => a.localeCompare(b))

  const navigateEntity = useCallback((entityId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('entity', entityId)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  const handleAmountSave = useCallback((projectId: string, month: string, amount: number) => {
    startTransition(async () => {
      await updateAllocations({ projectId, allocations: [{ month, amount, distribution: 'even' }] })
    })
  }, [startTransition])

  const handleStageChange = useCallback((projectId: string, stage: PipelineStage) => {
    startTransition(async () => {
      await updateProjectStage(projectId, stage)
    })
  }, [startTransition])

  const handleDelete = useCallback((projectId: string) => {
    if (!confirm('Delete this project? This will also remove any synced forecast lines.')) return
    startTransition(async () => {
      await deleteProject(projectId)
    })
  }, [startTransition])

  const handleToggleSync = useCallback((projectId: string, currentSynced: boolean) => {
    startTransition(async () => {
      await toggleProjectSync(projectId, !currentSynced)
    })
  }, [startTransition])

  return (
    <>
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border border-b-0 border-zinc-200 bg-white px-4 py-3">
        {/* Entity selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500">Entity:</span>
          <div className="flex gap-1">
            {entities.map((e) => (
              <button
                key={e.id}
                onClick={() => navigateEntity(e.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  e.id === selectedEntityId
                    ? 'bg-indigo-600 text-white'
                    : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-50',
                )}
              >
                {e.code ?? e.name}
              </button>
            ))}
          </div>
        </div>

        {/* Add Project */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Project
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-b-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[1400px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200">
              {/* Sticky left columns */}
              <th className="sticky left-0 z-20 min-w-[180px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                Client
              </th>
              <th className="sticky left-[180px] z-20 min-w-[200px] bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                Project
              </th>
              <th className="bg-zinc-50 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                Stage
              </th>
              <th className="bg-zinc-50 px-2.5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                Sync
              </th>
              {/* Month columns */}
              {months.map((m) => (
                <th key={m} className="bg-zinc-50 px-2.5 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {getMonthLabel(m)}
                </th>
              ))}
              {/* Total */}
              <th className="bg-zinc-50 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">
                Total
              </th>
              {/* Actions */}
              <th className="bg-zinc-50 px-3 py-2.5" aria-label="Actions" />
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100">
            {clientGroups.length === 0 && (
              <tr>
                <td
                  colSpan={5 + months.length + 1}
                  className="px-4 py-8 text-center text-sm text-zinc-400"
                >
                  No projects yet. Add one to get started.
                </td>
              </tr>
            )}

            {clientGroups.map(([clientName, clientProjects]) => (
              <Fragment key={`group-${clientName}`}>
                {/* Client header row */}
                <tr className="bg-zinc-50">
                  <td
                    className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700"
                    colSpan={2}
                  >
                    {clientName}
                  </td>
                  <td colSpan={3 + months.length} />
                </tr>

                {/* Project rows */}
                {clientProjects.map((proj) => {
                  const allocMap = new Map(proj.allocations.map((a) => [a.month, a.amount]))
                  const total = proj.allocations.reduce((s, a) => s + a.amount, 0)

                  return (
                    <tr key={proj.id} className="group hover:bg-zinc-50/50">
                      {/* Client name (for sticky alignment, blank as header shows it) */}
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs text-zinc-400 group-hover:bg-zinc-50/50" />

                      {/* Project name */}
                      <td className="sticky left-[180px] z-10 min-w-[200px] bg-white px-3 py-2 group-hover:bg-zinc-50/50">
                        <div className="text-xs font-medium text-zinc-900">{proj.projectName}</div>
                        {proj.jobNumber && (
                          <div className="text-xs text-zinc-400">{proj.jobNumber}</div>
                        )}
                      </td>

                      {/* Stage */}
                      <td className="px-3 py-2">
                        <select
                          value={proj.stage}
                          onChange={(e) =>
                            handleStageChange(proj.id, e.target.value as PipelineStage)
                          }
                          className="rounded border-0 bg-transparent p-0 text-xs focus:ring-0"
                          aria-label="Project stage"
                        >
                          {STAGES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Sync status */}
                      <td className="px-2.5 py-2">
                        <button
                          onClick={() => handleToggleSync(proj.id, proj.isSynced)}
                          title={proj.isSynced ? 'Click to pause sync' : 'Click to enable sync'}
                        >
                          <SyncStatus isSynced={proj.isSynced} />
                        </button>
                      </td>

                      {/* Month cells */}
                      {months.map((m) => (
                        <AmountCell
                          key={m}
                          projectId={proj.id}
                          month={m}
                          value={allocMap.get(m) ?? 0}
                          onSave={handleAmountSave}
                        />
                      ))}

                      {/* Total */}
                      <td className="px-3 py-1.5 text-right text-sm tabular-nums font-medium text-zinc-900">
                        {total === 0 ? (
                          <span className="text-zinc-300">—</span>
                        ) : (
                          formatAmount(total)
                        )}
                      </td>

                      {/* Delete */}
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleDelete(proj.id)}
                          className="invisible rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 group-hover:visible"
                          aria-label="Delete project"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Project drawer */}
      <ProjectDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entities={entities}
        clients={clients}
        selectedEntityId={selectedEntityId}
      />
    </>
  )
}

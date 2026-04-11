'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { createProject } from '@/app/(app)/pipeline/actions'
import type { PipelineClient } from '@/lib/pipeline/types'
import type { PipelineStage } from '@/lib/types'

interface ProjectDrawerProps {
  isOpen: boolean
  onClose: () => void
  entities: { id: string; name: string }[]
  clients: PipelineClient[]
  selectedEntityId: string
}

const STAGES: { value: PipelineStage; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'speculative', label: 'Speculative' },
  { value: 'declined', label: 'Declined' },
]

export function ProjectDrawer({
  isOpen,
  onClose,
  entities,
  clients,
  selectedEntityId,
}: ProjectDrawerProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showBilling, setShowBilling] = useState(false)

  const [form, setForm] = useState({
    entityId: selectedEntityId,
    clientName: '',
    jobNumber: '',
    projectName: '',
    taskEstimate: '',
    teamMember: '',
    stage: 'confirmed' as PipelineStage,
    invoiceDate: '',
    notes: '',
    billingAmount: '',
    thirdPartyCosts: '',
    isSynced: true,
  })

  const billing = parseFloat(form.billingAmount) || 0
  const costs = parseFloat(form.thirdPartyCosts) || 0
  const grossProfit = billing - costs

  // Clients filtered by selected entity for the datalist
  const entityClients = clients.filter((c) => c.entityId === form.entityId)

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value, type } = e.target
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const billingAmount = form.billingAmount !== '' ? parseFloat(form.billingAmount) : undefined
    const thirdPartyCosts =
      form.thirdPartyCosts !== '' ? parseFloat(form.thirdPartyCosts) : undefined

    startTransition(async () => {
      const result = await createProject({
        clientName: form.clientName,
        entityId: form.entityId,
        jobNumber: form.jobNumber || undefined,
        projectName: form.projectName,
        taskEstimate: form.taskEstimate || undefined,
        stage: form.stage,
        teamMember: form.teamMember || undefined,
        billingAmount,
        thirdPartyCosts,
        invoiceDate: form.invoiceDate || undefined,
        notes: form.notes || undefined,
        isSynced: form.isSynced,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      // Reset form and close
      setForm({
        entityId: selectedEntityId,
        clientName: '',
        jobNumber: '',
        projectName: '',
        taskEstimate: '',
        teamMember: '',
        stage: 'confirmed',
        invoiceDate: '',
        notes: '',
        billingAmount: '',
        thirdPartyCosts: '',
        isSynced: true,
      })
      setShowBilling(false)
      onClose()
    })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Add Project</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="space-y-4 px-4 py-4">

            {/* Entity */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">Entity</label>
              <select
                name="entityId"
                value={form.entityId}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Client name */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">Client Name</label>
              <input
                name="clientName"
                value={form.clientName}
                onChange={handleChange}
                list="client-suggestions"
                required
                placeholder="e.g. Acme Corp"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <datalist id="client-suggestions">
                {entityClients.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>

            {/* Job number */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">
                Job Number <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                name="jobNumber"
                value={form.jobNumber}
                onChange={handleChange}
                placeholder="e.g. JOB-001"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Project name */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">Project Name</label>
              <input
                name="projectName"
                value={form.projectName}
                onChange={handleChange}
                required
                placeholder="e.g. Website Redesign"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Task / estimate */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">
                Task / Estimate <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                name="taskEstimate"
                value={form.taskEstimate}
                onChange={handleChange}
                placeholder="e.g. 40h @ $150"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Team member */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">
                Team Member <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                name="teamMember"
                value={form.teamMember}
                onChange={handleChange}
                placeholder="e.g. Sarah"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Stage */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">Stage</label>
              <select
                name="stage"
                value={form.stage}
                onChange={handleChange}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice date */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">
                Invoice Date <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                name="invoiceDate"
                value={form.invoiceDate}
                onChange={handleChange}
                placeholder="e.g. End of June"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-zinc-700">
                Notes <span className="text-zinc-400">(optional)</span>
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Any additional notes…"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Billing breakdown (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setShowBilling((v) => !v)}
                className="flex w-full items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                <span>Billing Breakdown</span>
                <svg
                  className={cn('h-3.5 w-3.5 transition-transform', showBilling && 'rotate-180')}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showBilling && (
                <div className="mt-2 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700">Billing Amount</label>
                    <input
                      name="billingAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.billingAmount}
                      onChange={handleChange}
                      placeholder="0"
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700">Third Party Costs</label>
                    <input
                      name="thirdPartyCosts"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.thirdPartyCosts}
                      onChange={handleChange}
                      placeholder="0"
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-xs">
                    <span className="text-zinc-500">Gross Profit</span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        grossProfit < 0 ? 'text-red-600' : 'text-emerald-600',
                      )}
                    >
                      {grossProfit.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Sync to forecast */}
            <div className="flex items-center gap-2">
              <input
                id="isSynced"
                name="isSynced"
                type="checkbox"
                checked={form.isSynced}
                onChange={handleChange}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="isSynced" className="text-xs text-zinc-700">
                Sync allocations to forecast
              </label>
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-200 px-4 py-3">
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

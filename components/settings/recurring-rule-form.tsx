'use client'

import { useState, useTransition } from 'react'
import { createRecurringRule } from '@/app/(app)/settings/actions'

interface Props {
  entities: { id: string; name: string; code: string }[]
  categories: { id: string; name: string; code: string }[]
}

export function RecurringRuleForm({ entities, categories }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90">
        + Add Recurring Rule
      </button>
    )
  }

  return (
    <form
      className="rounded-lg border border-border bg-surface-raised p-4 space-y-3"
      action={(fd) => {
        startTransition(async () => {
          const result = await createRecurringRule(fd)
          if (!result.error) setOpen(false)
        })
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Description</label>
          <input name="description" required className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm" placeholder="AUG Payroll" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Amount (negative for outflows)</label>
          <input name="amount" type="number" step="0.01" required className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm" placeholder="-55000" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Entity</label>
          <select name="entityId" required className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm">
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Category</label>
          <select name="categoryId" required className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Frequency</label>
          <select name="frequency" required className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm">
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Anchor Date</label>
          <input name="anchorDate" type="date" required className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">Day of Month (for monthly)</label>
          <input name="dayOfMonth" type="number" min="1" max="31" className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">End Date (optional)</label>
          <input name="endDate" type="date" className="w-full rounded border border-border bg-surface px-3 py-1.5 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="rounded bg-brand px-4 py-1.5 text-sm text-white hover:bg-brand/90 disabled:opacity-50">
          {isPending ? 'Creating...' : 'Create Rule'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-border px-4 py-1.5 text-sm text-text-secondary">
          Cancel
        </button>
      </div>
    </form>
  )
}

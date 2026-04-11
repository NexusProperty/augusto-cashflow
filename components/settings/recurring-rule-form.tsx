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
      <button onClick={() => setOpen(true)} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
        + Add Recurring Rule
      </button>
    )
  }

  return (
    <form
      className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm space-y-3"
      action={(fd) => {
        startTransition(async () => {
          const result = await createRecurringRule(fd)
          if (!result.error) setOpen(false)
        })
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Description</label>
          <input name="description" required className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="AUG Payroll" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Amount (negative for outflows)</label>
          <input name="amount" type="number" step="0.01" required className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="-55000" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Entity</label>
          <select name="entityId" required className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Category</label>
          <select name="categoryId" required className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Frequency</label>
          <select name="frequency" required className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Anchor Date</label>
          <input name="anchorDate" type="date" required className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Day of Month (for monthly)</label>
          <input name="dayOfMonth" type="number" min="1" max="31" className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">End Date (optional)</label>
          <input name="endDate" type="date" className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
          {isPending ? 'Creating...' : 'Create Rule'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
          Cancel
        </button>
      </div>
    </form>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { undoAutoConfirm } from '@/app/(app)/documents/actions'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface AutoConfirmedItem {
  id: string
  counterparty: string | null
  amount: number | null
  expected_date: string | null
  invoice_number: string | null
  confidence: number | null
  suggested_status: string | null
  status_reason: string | null
}

export function AutoConfirmedSection({ items }: { items: AutoConfirmedItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const visibleItems = items.filter(i => !undoneIds.has(i.id))
  if (visibleItems.length === 0) return null

  function handleUndo(id: string) {
    startTransition(async () => {
      const result = await undoAutoConfirm(id)
      if (result.ok) {
        setUndoneIds(prev => new Set([...prev, id]))
      }
    })
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-emerald-900">
            Auto-confirmed
          </h2>
          <Badge variant="success">{visibleItems.length}</Badge>
        </div>
        <span className="text-xs text-emerald-700">
          {expanded ? 'Collapse' : 'Expand to review'}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1">
          {visibleItems.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border border-emerald-100 bg-white px-4 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {item.counterparty ?? 'Unknown'}
                  </p>
                  {item.suggested_status && (
                    <Badge variant="manual">{item.suggested_status.replace(/_/g, ' ')}</Badge>
                  )}
                </div>
                {item.status_reason && (
                  <p className="mt-0.5 text-xs text-zinc-500 italic">{item.status_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <p className={`text-sm font-bold whitespace-nowrap ${(item.amount ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {item.amount != null ? formatCurrency(item.amount) : '—'}
                </p>
                <button
                  onClick={() => handleUndo(item.id)}
                  disabled={isPending}
                  className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                >
                  Undo
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { bulkConfirmExtractions } from '@/app/(app)/documents/actions'

export function BulkConfirmBar({ extractionIds }: { extractionIds: string[] }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ confirmedCount?: number; error?: string } | null>(null)

  if (extractionIds.length === 0) return null

  function handleBulkConfirm() {
    setResult(null)
    startTransition(async () => {
      const res = await bulkConfirmExtractions(extractionIds)
      if (res.error) {
        setResult({ error: res.error })
      } else {
        setResult({ confirmedCount: res.data?.confirmedCount })
      }
    })
  }

  if (result?.confirmedCount) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-medium text-emerald-800">
          {result.confirmedCount} item(s) confirmed and added to forecast.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
      <p className="text-sm font-medium text-indigo-900">
        {extractionIds.length} item(s) pre-filled and ready to confirm
      </p>
      <div className="flex items-center gap-2">
        {result?.error && (
          <p className="text-xs text-red-600">{result.error}</p>
        )}
        <button
          onClick={handleBulkConfirm}
          disabled={isPending}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          {isPending ? 'Confirming...' : `Confirm All (${extractionIds.length})`}
        </button>
      </div>
    </div>
  )
}

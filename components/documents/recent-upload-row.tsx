'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

interface RecentUpload {
  id: string
  filename: string
  file_size: number
  created_at: string
  status: string
}

const STATUSES_NEEDING_PROCESS = new Set(['uploaded', 'failed', 'parsing'])

export function RecentUploadRow({ doc }: { doc: RecentUpload }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canProcess = STATUSES_NEEDING_PROCESS.has(doc.status)

  async function handleProcess() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? res.statusText ?? 'Failed')
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{doc.filename}</p>
        <p className="text-xs text-zinc-500">
          {new Date(doc.created_at).toLocaleDateString('en-NZ')} · {Math.round(doc.file_size / 1024)}KB
        </p>
        {error && <p className="mt-1 text-xs text-red-600">Process failed: {error}</p>}
      </div>
      <div className="flex items-center gap-2">
        {canProcess && (
          <button
            onClick={handleProcess}
            disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Processing…' : doc.status === 'failed' ? 'Retry' : 'Process'}
          </button>
        )}
        <Badge
          variant={
            doc.status === 'confirmed'
              ? 'success'
              : doc.status === 'failed'
                ? 'danger'
                : doc.status === 'ready_for_review'
                  ? 'warning'
                  : 'manual'
          }
        >
          {doc.status}
        </Badge>
      </div>
    </div>
  )
}

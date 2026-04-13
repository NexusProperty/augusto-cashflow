'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteDocument } from '@/app/(app)/documents/actions'
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
  const [isDeleting, startDelete] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const canProcess = STATUSES_NEEDING_PROCESS.has(doc.status)
  const blockUi = busy || isDeleting

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

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${doc.filename}"?\n\nThe file and any pending extractions will be removed. Forecast lines already confirmed from this document will stay (just unlinked).`,
    )
    if (!confirmed) return
    setError(null)
    startDelete(async () => {
      const res = await deleteDocument(doc.id)
      if (res.error) {
        setError(res.error)
      } else {
        router.refresh()
      }
    })
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
            disabled={blockUi}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Processing…' : doc.status === 'failed' ? 'Retry' : 'Process'}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={blockUi}
          title="Delete this document"
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
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

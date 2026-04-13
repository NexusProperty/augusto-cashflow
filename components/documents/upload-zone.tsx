'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadDocument } from '@/app/(app)/documents/actions'

export function UploadZone() {
  const router = useRouter()
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.set('file', file)
      startTransition(async () => {
        const result = await uploadDocument(fd)
        if (result.error || !result.data?.id) {
          setMessage({ text: result.error ?? 'Upload failed', type: 'error' })
          return
        }

        setMessage({ text: `${file.name} uploaded — AI is reading it…`, type: 'success' })
        setIsProcessing(true)
        try {
          const res = await fetch('/api/documents/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: result.data.id }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            setMessage({
              text: `Processing failed: ${body.error ?? res.statusText}. Click Process on the card below to retry.`,
              type: 'error',
            })
          } else {
            setMessage({ text: `${file.name} ready for review.`, type: 'success' })
          }
        } catch (err) {
          setMessage({
            text: `Processing error: ${err instanceof Error ? err.message : 'Network'}. Click Process on the card below to retry.`,
            type: 'error',
          })
        } finally {
          setIsProcessing(false)
          router.refresh()
        }
      })
    }
  }

  const busy = isPending || isProcessing

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-300 bg-white'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
      }}
    >
      <p className="text-sm text-zinc-600">
        {isPending
          ? 'Uploading…'
          : isProcessing
            ? 'AI processing…'
            : 'Drag & drop files here, or'}
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
      >
        Browse Files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.eml,.msg,.docx,.doc"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <p className="mt-2 text-xs text-zinc-400">
        PDF, Excel, CSV, images, emails, Word docs
      </p>
      {message && (
        <p className={`mt-3 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

'use client'

import { useState, useRef, useTransition } from 'react'
import { uploadDocument } from '@/app/(app)/documents/actions'

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.set('file', file)
      startTransition(async () => {
        const result = await uploadDocument(fd)
        if (result.error) {
          setMessage({ text: result.error, type: 'error' })
        } else {
          setMessage({ text: `${file.name} uploaded — processing...`, type: 'success' })
        }
      })
    }
  }

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
        {isPending ? 'Uploading...' : 'Drag & drop files here, or'}
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
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

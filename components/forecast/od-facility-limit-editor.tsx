'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCurrency } from '@/lib/utils'

interface OdFacilityLimitEditorProps {
  value: number
  editable: boolean
  onCommit: (next: number) => void
}

function parseAmount(raw: string): number | null {
  // Strip everything that isn't digit or decimal point. Explicitly drops
  // minus signs so negative OD limits are impossible via this input.
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (cleaned === '') return 0
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function OdFacilityLimitEditor({ value, editable, onCommit }: OdFacilityLimitEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(String(value))
  }, [value, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commit = () => {
    const parsed = parseAmount(draft)
    if (parsed === null) {
      setDraft(String(value))
    } else if (parsed !== value) {
      onCommit(parsed)
    }
    setEditing(false)
  }

  if (!editable) {
    return <span className="font-medium text-zinc-700 tabular-nums">{formatCurrency(value)}</span>
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,$ ]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)); setEditing(false) }
        }}
        className="w-28 rounded border border-blue-400 bg-white px-1.5 py-0.5 text-sm tabular-nums text-zinc-900 outline-none ring-1 ring-blue-200"
        inputMode="numeric"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded px-1 font-medium text-zinc-700 tabular-nums hover:bg-zinc-100 hover:text-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
      title="Click to edit OD facility limit"
    >
      {formatCurrency(value)}
    </button>
  )
}

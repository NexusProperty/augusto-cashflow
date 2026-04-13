'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface SummaryFindBarProps {
  query: string
  total: number
  currentIndex: number | null
  onlyMatching: boolean
  onQueryChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onOnlyMatchingChange: (checked: boolean) => void
}

/**
 * Inline find bar for the pipeline summary grid.
 * Mounted into the toolbar's LEFT slot. Auto-focuses the input on mount.
 *
 * Keys (input-scoped):
 *   Enter / F3       → next (Shift+… → prev)
 *   ArrowDown / Up   → next / prev
 *   Escape           → close
 */
export function SummaryFindBar({
  query,
  total,
  currentIndex,
  onlyMatching,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
  onOnlyMatchingChange,
}: SummaryFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Enter' || e.key === 'F3') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) onPrev()
      else onNext()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      onNext()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      onPrev()
    }
  }

  const counterText = (() => {
    if (!query.trim()) return ''
    if (total === 0) return '0 of 0'
    const n = currentIndex !== null ? currentIndex + 1 : 1
    return `${n} of ${total}`
  })()

  const liveText = (() => {
    if (!query.trim()) return ''
    if (total === 0) return 'No matches'
    const n = currentIndex !== null ? currentIndex + 1 : 1
    return `Match ${n} of ${total}`
  })()

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1',
      )}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        placeholder="Find…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-40 rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {counterText && (
        <span className="min-w-[52px] text-center text-xs tabular-nums text-zinc-500">
          {counterText}
        </span>
      )}

      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveText}
      </span>

      <button
        type="button"
        onClick={onPrev}
        disabled={total === 0}
        title="Previous match (Shift+Enter)"
        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={total === 0}
        title="Next match (Enter)"
        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <label className="flex cursor-pointer items-center gap-1 text-xs text-zinc-500 select-none">
        <input
          type="checkbox"
          checked={onlyMatching}
          onChange={(e) => onOnlyMatchingChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-zinc-300 accent-indigo-600"
        />
        Only matching rows
      </label>

      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

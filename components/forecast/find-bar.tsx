'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface FindBarProps {
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
 * Floating find bar — rendered in the top-right of the grid container.
 * Auto-focuses the input on mount.
 *
 * Key behaviour:
 *   - Enter / F3 → next match (Shift+Enter / Shift+F3 → prev)
 *   - Escape → close
 *   - stopPropagation on handled keys so they don't reach the grid keydown handler.
 */
export function FindBar({
  query,
  total,
  currentIndex,
  onlyMatching,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
  onOnlyMatchingChange,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus on mount.
  useEffect(() => {
    inputRef.current?.focus()
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
      if (e.shiftKey) {
        onPrev()
      } else {
        onNext()
      }
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

  // Counter display: "1 of 5", or "No results" when there are matches queried
  // but none found, or blank when no query.
  const counterText = (() => {
    if (!query.trim()) return ''
    if (total === 0) return 'No results'
    const n = currentIndex !== null ? currentIndex + 1 : 1
    return `${n} of ${total}`
  })()

  return (
    <div
      className={cn(
        'absolute right-2 top-2 z-40 flex items-center gap-2',
        'rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg',
      )}
      // Prevent mousedown inside the bar from clearing the grid selection.
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        placeholder="Find…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-44 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {/* Counter */}
      {counterText && (
        <span className="min-w-[52px] text-center text-xs tabular-nums text-zinc-500">
          {counterText}
        </span>
      )}

      {/* Previous button */}
      <button
        type="button"
        onClick={onPrev}
        disabled={total === 0}
        title="Previous match (Shift+Enter)"
        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-300"
      >
        {/* Up chevron */}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Next button */}
      <button
        type="button"
        onClick={onNext}
        disabled={total === 0}
        title="Next match (Enter)"
        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-300"
      >
        {/* Down chevron */}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Only matching rows checkbox */}
      <label className="flex cursor-pointer items-center gap-1 text-xs text-zinc-500 select-none">
        <input
          type="checkbox"
          checked={onlyMatching}
          onChange={(e) => onOnlyMatchingChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-zinc-300 accent-indigo-600"
        />
        Only matching
      </label>

      {/* Close button */}
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

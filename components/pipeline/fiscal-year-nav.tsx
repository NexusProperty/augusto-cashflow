'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentFiscalYear } from '@/lib/pipeline/fiscal-year'

export function FiscalYearNav() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentFY = getCurrentFiscalYear()
  const fy = parseInt(searchParams.get('fy') ?? String(currentFY), 10)

  function navigate(newFy: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fy', String(newFy))
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate(fy - 1)}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50"
        aria-label="Previous fiscal year"
      >
        &larr;
      </button>
      <span className="text-sm font-semibold text-zinc-900">
        FY{fy} ({fy - 1}/{fy})
      </span>
      <button
        onClick={() => navigate(fy + 1)}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50"
        aria-label="Next fiscal year"
      >
        &rarr;
      </button>
    </div>
  )
}

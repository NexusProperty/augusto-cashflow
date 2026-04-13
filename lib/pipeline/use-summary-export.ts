'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BUSummaryRow } from '@/lib/pipeline/types'
import type { FlatSummaryRow } from '@/lib/pipeline/summary-flat-rows'
import type { Selection } from '@/lib/pipeline/summary-selection'
import { buildSummaryCsv } from '@/lib/pipeline/export-summary'

export type ExportScope = 'all' | 'view' | 'selection'

interface UseSummaryExportArgs {
  rows: BUSummaryRow[]
  flatRows: FlatSummaryRow[]
  months: string[]
  selection: Selection | null
  collapsed: Record<string, boolean>
  fiscalYear?: number
}

export interface UseSummaryExportResult {
  exportOpen: boolean
  setExportOpen: React.Dispatch<React.SetStateAction<boolean>>
  exportBtnRef: React.RefObject<HTMLButtonElement | null>
  exportContainerRef: React.RefObject<HTMLDivElement | null>
  handleExport: (scope: ExportScope) => void
  closeExport: () => void
}

export function useSummaryExport({
  rows,
  flatRows,
  months,
  selection,
  collapsed,
  fiscalYear,
}: UseSummaryExportArgs): UseSummaryExportResult {
  const [exportOpen, setExportOpen] = useState(false)
  const exportBtnRef = useRef<HTMLButtonElement | null>(null)
  const exportContainerRef = useRef<HTMLDivElement | null>(null)

  // Outside-click listener — close dropdown when clicking outside.
  useEffect(() => {
    if (!exportOpen) return
    function onDocMouseDown(e: MouseEvent) {
      const el = exportContainerRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [exportOpen])

  const closeExport = useCallback(() => {
    setExportOpen(false)
    // Return focus to the trigger.
    exportBtnRef.current?.focus()
  }, [])

  const handleExport = useCallback(
    (scope: ExportScope) => {
      let csv: string
      if (scope === 'selection') {
        if (!selection) return
        csv = buildSummaryCsv({ flatRows, months, selection, scope: 'selection' })
      } else {
        csv = buildSummaryCsv({
          rows,
          months,
          scope,
          collapsed: scope === 'view' ? collapsed : undefined,
        })
      }
      const fy = fiscalYear ?? (months[0] ? parseInt(months[0].slice(0, 4), 10) + 1 : 0)
      const fyLabel = fy ? `FY${String(fy).slice(-2)}` : 'FY'
      const filename = `pipeline-summary-${fyLabel}-${scope}.csv`
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportOpen(false)
    },
    [rows, months, fiscalYear, flatRows, selection, collapsed],
  )

  return {
    exportOpen,
    setExportOpen,
    exportBtnRef,
    exportContainerRef,
    handleExport,
    closeExport,
  }
}

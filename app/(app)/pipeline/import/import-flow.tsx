'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { importFromExcel, commitImport } from '../actions'
import type { ImportedProject, ImportedTarget } from '@/lib/pipeline/excel-import'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Entity {
  id: string
  name: string
  code: string
}

interface ParsedData {
  projects: ImportedProject[]
  targets: ImportedTarget[]
  errors: string[]
}

interface Props {
  entities: Entity[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function totalAllocationAmount(allocations: { month: string; amount: number }[]) {
  return allocations.reduce((s, a) => s + a.amount, 0)
}

const STAGE_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  awaiting_approval: 'Awaiting Approval',
  upcoming: 'Upcoming',
  speculative: 'Speculative',
  declined: 'Declined',
}

const STAGE_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-800',
  awaiting_approval: 'bg-amber-100 text-amber-800',
  upcoming: 'bg-sky-100 text-sky-800',
  speculative: 'bg-rose-100 text-rose-800',
  declined: 'bg-zinc-100 text-zinc-600',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportFlow({ entities }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [successCount, setSuccessCount] = useState<number | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isCommitting, startCommitting] = useTransition()

  // Build entity code → ID map from entities
  const entityMap: Record<string, string> = {}
  for (const e of entities) {
    entityMap[e.code] = e.id
  }

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      setParseError('Please upload an .xlsx file')
      return
    }
    setFileName(file.name)
    setParseError('')
    setParsed(null)
    setSuccessCount(null)

    const formData = new FormData()
    formData.append('file', file)

    startParsing(async () => {
      const result = await importFromExcel(formData)
      if ('error' in result && result.error) {
        setParseError(result.error)
        return
      }
      if (result.data) {
        setParsed(result.data as ParsedData)
      }
    })
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleCommit() {
    if (!parsed) return

    startCommitting(async () => {
      const result = await commitImport(parsed.projects, parsed.targets, entityMap)
      if ('ok' in result && result.ok) {
        setSuccessCount(result.created ?? 0)
        setParsed(null)
        setFileName('')
      } else {
        setParseError('Import failed — please try again')
      }
    })
  }

  // Group projects by entity code for display
  const groupedProjects: Record<string, ImportedProject[]> = {}
  if (parsed) {
    for (const proj of parsed.projects) {
      if (!groupedProjects[proj.entityCode]) {
        groupedProjects[proj.entityCode] = []
      }
      groupedProjects[proj.entityCode].push(proj)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Import from Excel</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Upload the Agency Revenue Tracker workbook to import projects and targets.
          </p>
        </div>
        <Link
          href="/pipeline"
          className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          Back to pipeline
        </Link>
      </div>

      {/* Success state */}
      {successCount !== null && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm font-medium text-emerald-800">
            Import complete — {successCount} project{successCount !== 1 ? 's' : ''} created.
          </p>
          <div className="mt-3 flex gap-3">
            <Link
              href="/pipeline"
              className="text-sm font-medium text-emerald-700 hover:text-emerald-900"
            >
              View pipeline
            </Link>
            <button
              type="button"
              onClick={() => setSuccessCount(null)}
              className="text-sm text-emerald-600 hover:text-emerald-800"
            >
              Import another file
            </button>
          </div>
        </div>
      )}

      {/* Upload zone — hidden when showing results */}
      {successCount === null && !parsed && (
        <div
          className={[
            'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100',
          ].join(' ')}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleInputChange}
          />
          <div className="text-4xl mb-3 select-none">📊</div>
          <p className="text-sm font-medium text-zinc-700">
            {isParsing ? 'Parsing workbook…' : 'Drop your .xlsx file here, or click to select'}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Agency Revenue Tracker format only</p>
          {fileName && !isParsing && (
            <p className="mt-2 text-xs text-zinc-500">Selected: {fileName}</p>
          )}
        </div>
      )}

      {/* Re-upload button when showing preview */}
      {successCount === null && parsed && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => { setParsed(null); setFileName('') }}
            className="text-sm text-zinc-500 hover:text-zinc-800"
          >
            Upload a different file
          </button>
          {fileName && (
            <span className="text-xs text-zinc-400">{fileName}</span>
          )}
        </div>
      )}

      {/* Error / parse errors */}
      {parseError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{parseError}</p>
        </div>
      )}

      {/* Non-fatal warnings from parser */}
      {parsed && parsed.errors.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            {parsed.errors.length} warning{parsed.errors.length !== 1 ? 's' : ''} during parse:
          </p>
          <ul className="list-disc list-inside space-y-1">
            {parsed.errors.map((e, i) => (
              <li key={i} className="text-xs text-amber-700">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview table */}
      {parsed && parsed.projects.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              Found{' '}
              <span className="font-semibold text-zinc-900">{parsed.projects.length} projects</span>
              {parsed.targets.length > 0 && (
                <> and <span className="font-semibold text-zinc-900">{parsed.targets.length} target entries</span></>
              )}
            </p>
            <button
              type="button"
              onClick={handleCommit}
              disabled={isCommitting}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {isCommitting ? 'Importing…' : `Import All (${parsed.projects.length})`}
            </button>
          </div>

          {Object.entries(groupedProjects).map(([code, projs]) => {
            const entityName = entities.find((e) => e.code === code)?.name ?? code
            const hasEntityId = !!entityMap[code]
            return (
              <div key={code} className="rounded-xl border border-zinc-200 overflow-hidden">
                <div className="bg-zinc-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-zinc-900">{entityName}</span>
                    <span className="text-xs text-zinc-400 font-mono">{code}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{projs.length} projects</span>
                    {!hasEntityId && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                        Entity not found — will skip
                      </span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 bg-white">
                        <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Client</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Project</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Stage</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-zinc-500">Total</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-zinc-500">Months</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {projs.map((proj, i) => (
                        <tr key={i} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-4 py-2 text-zinc-600 text-xs">{proj.clientName}</td>
                          <td className="px-4 py-2 text-zinc-900 font-medium text-xs">{proj.projectName}</td>
                          <td className="px-4 py-2">
                            <span
                              className={[
                                'inline-block text-xs px-2 py-0.5 rounded-full font-medium',
                                STAGE_COLORS[proj.stage] ?? 'bg-zinc-100 text-zinc-600',
                              ].join(' ')}
                            >
                              {STAGE_LABELS[proj.stage] ?? proj.stage}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-900 text-xs font-medium tabular-nums">
                            {formatCurrency(totalAllocationAmount(proj.allocations))}
                          </td>
                          <td className="px-4 py-2 text-right text-zinc-500 text-xs tabular-nums">
                            {proj.allocations.length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Commit button (bottom) */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleCommit}
              disabled={isCommitting}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              {isCommitting ? 'Importing…' : `Import All (${parsed.projects.length} projects)`}
            </button>
          </div>
        </div>
      )}

      {/* Empty parse result */}
      {parsed && parsed.projects.length === 0 && (
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-6 text-center">
          <p className="text-sm text-zinc-500">No projects found in the workbook.</p>
          <p className="mt-1 text-xs text-zinc-400">
            Make sure you are uploading the correct Agency Revenue Tracker format.
          </p>
        </div>
      )}
    </div>
  )
}

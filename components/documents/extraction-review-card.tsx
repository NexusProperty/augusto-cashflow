'use client'

import { useState, useTransition } from 'react'
import { confirmExtraction, dismissExtraction } from '@/app/(app)/documents/actions'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface Entity {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
  code: string
  flow_direction: string
}

interface Period {
  id: string
  week_ending: string
}

interface BankAccount {
  id: string
  name: string
  entity_id: string
  account_number: string | null
  account_type: string
  entities: { name: string } | null
}

interface Extraction {
  id: string
  counterparty: string | null
  amount: number | null
  expected_date: string | null
  entity_name: string | null
  category_name: string | null
  invoice_number: string | null
  confidence: number | null
  raw_text: string | null
  documents: { filename: string } | null
}

export function ExtractionReviewCard({
  extraction,
  entities,
  categories,
  periods,
  bankAccounts,
}: {
  extraction: Extraction
  entities: Entity[]
  categories: Category[]
  periods: Period[]
  bankAccounts: BankAccount[]
}) {
  const [isPending, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  // Auto-match entity from extraction
  const matchedEntity = extraction.entity_name
    ? entities.find(e => e.name.toLowerCase() === extraction.entity_name!.toLowerCase())
    : undefined

  // Auto-match category from extraction hint
  const categoryHintMap: Record<string, string> = {
    accounts_receivable: 'inflows_ar',
    accounts_payable: 'outflows_ap',
    payroll: 'outflows_payroll',
    rent: 'outflows_rent',
    loan: 'loans',
  }
  const hintCode = extraction.category_name ? categoryHintMap[extraction.category_name] : undefined
  const matchedCategory = hintCode
    ? categories.find(c => c.code === hintCode)
    : undefined

  // Auto-match period from expected_date
  const matchedPeriod = extraction.expected_date
    ? periods.find(p => {
        const weekEnd = new Date(p.week_ending)
        const expected = new Date(extraction.expected_date!)
        const weekStart = new Date(weekEnd)
        weekStart.setDate(weekStart.getDate() - 6)
        return expected >= weekStart && expected <= weekEnd
      })
    : undefined

  // Auto-match bank account from entity
  const matchedBankAccount = matchedEntity
    ? bankAccounts.find(ba => ba.entity_id === matchedEntity.id)
    : undefined

  const [entityId, setEntityId] = useState(matchedEntity?.id ?? '')
  const [categoryId, setCategoryId] = useState(matchedCategory?.id ?? '')
  const [periodId, setPeriodId] = useState(matchedPeriod?.id ?? '')
  const [bankAccountId, setBankAccountId] = useState(matchedBankAccount?.id ?? '')
  const [amount, setAmount] = useState(extraction.amount?.toString() ?? '')
  const [lineStatus, setLineStatus] = useState<string>('none')

  if (dismissed || confirmed) return null

  const confidencePct = Math.round((extraction.confidence ?? 0) * 100)
  const leafCategories = categories.filter(c => c.flow_direction !== 'balance' && c.flow_direction !== 'computed' && !['inflows', 'outflows', 'loans', 'closing'].includes(c.code))

  // When entity changes, auto-select matching bank account
  function handleEntityChange(newEntityId: string) {
    setEntityId(newEntityId)
    const matching = bankAccounts.find(ba => ba.entity_id === newEntityId)
    if (matching) setBankAccountId(matching.id)
  }

  function handleConfirm() {
    setError(null)
    if (!entityId) { setError('Select an entity'); return }
    if (!categoryId) { setError('Select a category'); return }
    if (!periodId) { setError('Select a period'); return }
    if (!bankAccountId) { setError('Select a bank account'); return }

    startTransition(async () => {
      const result = await confirmExtraction(extraction.id, {
        entityId,
        categoryId,
        periodId,
        bankAccountId,
        amount: parseFloat(amount) || 0,
        lineStatus,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setConfirmed(true)
      }
    })
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissExtraction(extraction.id)
      setDismissed(true)
    })
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900 truncate">
              {extraction.counterparty ?? 'Unknown counterparty'}
            </p>
            <Badge variant={confidencePct >= 80 ? 'success' : confidencePct >= 50 ? 'warning' : 'danger'}>
              {confidencePct}%
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {extraction.documents?.filename} · {extraction.invoice_number ?? 'No invoice #'}
            {extraction.expected_date && ` · Due ${extraction.expected_date}`}
          </p>
        </div>
        <p className={`text-lg font-bold whitespace-nowrap ${(extraction.amount ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {extraction.amount ? formatCurrency(extraction.amount) : '—'}
        </p>
      </div>

      {/* Expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-xs text-indigo-600 hover:text-indigo-500"
      >
        {expanded ? 'Hide details' : 'Review & assign'}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
          {/* Row 1: Amount + Bank Account */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Bank Account selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Bank Account</label>
              <select
                value={bankAccountId}
                onChange={e => setBankAccountId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select account...</option>
                {bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>
                    {ba.name}{ba.account_number ? ` (${ba.account_number.slice(-7)})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status selector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Status</label>
            <select
              value={lineStatus}
              onChange={e => setLineStatus(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-auto"
            >
              <option value="none">No status</option>
              <option value="confirmed">Confirmed</option>
              <option value="tbc">TBC (no invoice yet)</option>
              <option value="awaiting_payment">Awaiting Payment</option>
              <option value="paid">Paid</option>
              <option value="remittance_received">Remittance Received</option>
              <option value="speculative">Speculative</option>
              <option value="awaiting_budget_approval">Awaiting Budget Approval</option>
            </select>
          </div>

          {/* Row 2: Entity, Category, Period */}
          <div className="grid grid-cols-3 gap-3">
            {/* Entity selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Entity</label>
              <select
                value={entityId}
                onChange={e => handleEntityChange(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select entity...</option>
                {entities.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            {/* Category selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Category</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select category...</option>
                {leafCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Period selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Week ending</label>
              <select
                value={periodId}
                onChange={e => setPeriodId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select week...</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>
                    w/e {new Date(p.week_ending + 'T00:00:00').toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Raw text preview */}
          {extraction.raw_text && (
            <div className="rounded-md bg-zinc-50 p-2">
              <p className="text-xs text-zinc-500 italic line-clamp-2">{extraction.raw_text}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Confirm & add to forecast'}
            </button>
            <button
              onClick={handleDismiss}
              disabled={isPending}
              className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-200 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

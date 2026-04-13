'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  bulkApplyAndConfirm,
  bulkUpdateExtractionSuggestions,
} from '@/app/(app)/documents/actions'
import { Badge } from '@/components/ui/badge'
import { ExtractionReviewCard } from './extraction-review-card'

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
  suggested_entity_id: string | null
  suggested_bank_account_id: string | null
  suggested_category_id: string | null
  suggested_period_id: string | null
  suggested_status: string | null
  status_reason: string | null
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tbc', label: 'TBC' },
  { value: 'awaiting_payment', label: 'Awaiting Payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'remittance_received', label: 'Remittance Received' },
  { value: 'speculative', label: 'Speculative' },
  { value: 'awaiting_budget_approval', label: 'Awaiting Budget Approval' },
  { value: 'none', label: 'No status' },
]

export function NeedsAttentionSection({
  extractions,
  entities,
  categories,
  periods,
  bankAccounts,
}: {
  extractions: Extraction[]
  entities: Entity[]
  categories: Category[]
  periods: Period[]
  bankAccounts: BankAccount[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [bulkEntity, setBulkEntity] = useState('')
  const [bulkBank, setBulkBank] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkPeriod, setBulkPeriod] = useState('')
  const [bulkStatus, setBulkStatus] = useState('')

  const leafCategories = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.flow_direction !== 'balance' &&
          c.flow_direction !== 'computed' &&
          !['inflows', 'outflows', 'loans', 'closing'].includes(c.code),
      ),
    [categories],
  )

  const ids = useMemo(() => extractions.map((e) => e.id), [extractions])
  const allSelected = ids.length > 0 && selected.size === ids.length
  const someSelected = selected.size > 0 && !allSelected
  const hasAnyBulkField = Boolean(
    bulkEntity || bulkBank || bulkCategory || bulkPeriod || bulkStatus,
  )

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(ids) : new Set())
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function runBulk(intent: 'apply' | 'confirm') {
    setError(null)
    setSuccessMsg(null)
    if (selected.size === 0) {
      setError('Select at least one item')
      return
    }
    // Apply (suggestions-only) requires at least one picker set.
    // Confirm can be run with no pickers if every selected row is already
    // fully resolved — we'll let the server validate and report back.
    if (intent === 'apply' && !hasAnyBulkField) {
      setError('Pick a value in at least one field below')
      return
    }
    const updates: {
      suggestedEntityId?: string
      suggestedBankAccountId?: string
      suggestedCategoryId?: string
      suggestedPeriodId?: string
      suggestedStatus?: string
    } = {}
    if (bulkEntity) updates.suggestedEntityId = bulkEntity
    if (bulkBank) updates.suggestedBankAccountId = bulkBank
    if (bulkCategory) updates.suggestedCategoryId = bulkCategory
    if (bulkPeriod) updates.suggestedPeriodId = bulkPeriod
    if (bulkStatus) updates.suggestedStatus = bulkStatus

    const count = selected.size

    startTransition(async () => {
      if (intent === 'apply') {
        const res = await bulkUpdateExtractionSuggestions(
          Array.from(selected),
          updates,
        )
        if (res.error) {
          setError(res.error)
          return
        }
        setSuccessMsg(`${count} item${count === 1 ? '' : 's'} updated.`)
      } else {
        const res = await bulkApplyAndConfirm(Array.from(selected), updates)
        if (res.error) {
          setError(res.error)
          return
        }
        const parts: string[] = []
        if (res.confirmedCount)
          parts.push(
            `${res.confirmedCount} added to forecast`,
          )
        if (res.stillMissing)
          parts.push(`${res.stillMissing} still need fields`)
        setSuccessMsg(parts.join(' · ') || 'Nothing to confirm.')
      }
      setSelected(new Set())
      setBulkEntity('')
      setBulkBank('')
      setBulkCategory('')
      setBulkPeriod('')
      setBulkStatus('')
    })
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">
        Needs Attention
        <Badge variant="danger" className="ml-2">
          {extractions.length}
        </Badge>
      </h2>

      {/* Bulk bar */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={(e) => toggleAll(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            />
            Select all ({ids.length})
          </label>
          <span className="text-sm text-zinc-500">
            {selected.size > 0 ? `${selected.size} selected` : 'None selected'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            {successMsg && <span className="text-xs text-emerald-700">{successMsg}</span>}
            <button
              onClick={() => runBulk('apply')}
              disabled={isPending || selected.size === 0 || !hasAnyBulkField}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {isPending
                ? 'Working…'
                : `Apply to ${selected.size || 0} selected`}
            </button>
            <button
              onClick={() => runBulk('confirm')}
              disabled={isPending || selected.size === 0}
              title="Apply the picked fields, then add any now-complete items to the forecast"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {isPending ? 'Working…' : 'Confirm & add to forecast'}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <BulkSelect
            label="Entity"
            value={bulkEntity}
            onChange={setBulkEntity}
            disabled={isPending}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </BulkSelect>
          <BulkSelect
            label="Bank account"
            value={bulkBank}
            onChange={setBulkBank}
            disabled={isPending}
          >
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.account_number ? ` (${b.account_number.slice(-7)})` : ''}
              </option>
            ))}
          </BulkSelect>
          <BulkSelect
            label="Category"
            value={bulkCategory}
            onChange={setBulkCategory}
            disabled={isPending}
          >
            {leafCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </BulkSelect>
          <BulkSelect
            label="Week ending"
            value={bulkPeriod}
            onChange={setBulkPeriod}
            disabled={isPending}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                w/e{' '}
                {new Date(p.week_ending + 'T00:00:00').toLocaleDateString('en-NZ', {
                  day: '2-digit',
                  month: 'short',
                })}
              </option>
            ))}
          </BulkSelect>
          <BulkSelect
            label="Status"
            value={bulkStatus}
            onChange={setBulkStatus}
            disabled={isPending}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </BulkSelect>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Only the fields you pick get applied. Everything else on each item is
          left unchanged.
        </p>
      </div>

      {/* Cards */}
      <div className="mt-3 space-y-2">
        {extractions.map((ext) => {
          const suggestionKey = [
            ext.suggested_entity_id,
            ext.suggested_bank_account_id,
            ext.suggested_category_id,
            ext.suggested_period_id,
            ext.suggested_status,
          ].join('|')
          return (
            <ExtractionReviewCard
              key={`${ext.id}:${suggestionKey}`}
              extraction={ext}
              entities={entities}
              categories={categories}
              periods={periods}
              bankAccounts={bankAccounts}
              selectable
              selected={selected.has(ext.id)}
              onSelectChange={(checked) => toggleOne(ext.id, checked)}
            />
          )
        })}
      </div>
    </div>
  )
}

function BulkSelect({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
      >
        <option value="">— leave unchanged —</option>
        {children}
      </select>
    </div>
  )
}

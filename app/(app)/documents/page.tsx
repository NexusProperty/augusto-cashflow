import { createClient } from '@/lib/supabase/server'
import { UploadZone } from '@/components/documents/upload-zone'
import { ExtractionReviewCard } from '@/components/documents/extraction-review-card'
import { AutoConfirmedSection } from '@/components/documents/auto-confirmed-section'
import { BulkConfirmBar } from '@/components/documents/bulk-confirm-bar'
import { Badge } from '@/components/ui/badge'

export default async function DocumentsPage() {
  const supabase = await createClient()

  const [
    { data: documents },
    { data: pendingExtractions },
    { data: autoConfirmedExtractions },
    { data: entities },
    { data: categories },
    { data: periods },
    { data: bankAccounts },
  ] = await Promise.all([
    supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(50),
    supabase
      .from('document_extractions')
      .select('*, documents(filename)')
      .eq('is_confirmed', false)
      .eq('is_dismissed', false)
      .eq('auto_confirmed', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('document_extractions')
      .select('id, counterparty, amount, expected_date, invoice_number, confidence, suggested_status, status_reason')
      .eq('auto_confirmed', true)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('entities').select('id, name').order('name'),
    supabase.from('categories').select('id, name, code, flow_direction').order('sort_order'),
    supabase.from('forecast_periods').select('id, week_ending').order('week_ending'),
    supabase
      .from('bank_accounts')
      .select('id, name, entity_id, account_number, account_type, entities(name)')
      .eq('is_active', true)
      .order('name'),
  ])

  // Split pending into fully-resolved (bulk confirmable) vs needs-attention
  const fullyResolved = (pendingExtractions ?? []).filter((ext: any) =>
    ext.suggested_entity_id &&
    ext.suggested_bank_account_id &&
    ext.suggested_category_id &&
    ext.suggested_period_id &&
    ext.suggested_status
  )
  const needsAttention = (pendingExtractions ?? []).filter((ext: any) =>
    !ext.suggested_entity_id ||
    !ext.suggested_bank_account_id ||
    !ext.suggested_category_id ||
    !ext.suggested_period_id ||
    !ext.suggested_status
  )

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>

      <UploadZone />

      {/* Tier 1: Auto-confirmed (collapsed) */}
      <AutoConfirmedSection items={autoConfirmedExtractions ?? []} />

      {/* Tier 2: Pending Review — fully resolved, bulk confirmable */}
      {fullyResolved.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">
            Pending Review
            <Badge variant="warning" className="ml-2">{fullyResolved.length}</Badge>
          </h2>
          <BulkConfirmBar extractionIds={fullyResolved.map((e: any) => e.id)} />
          <div className="mt-2 space-y-2">
            {fullyResolved.map((ext: any) => (
              <ExtractionReviewCard
                key={ext.id}
                extraction={ext}
                entities={entities ?? []}
                categories={categories ?? []}
                periods={periods ?? []}
                bankAccounts={(bankAccounts ?? []) as any /* Supabase join returns entities as array */}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tier 3: Needs Attention — incomplete resolution */}
      {needsAttention.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">
            Needs Attention
            <Badge variant="danger" className="ml-2">{needsAttention.length}</Badge>
          </h2>
          <div className="space-y-2">
            {needsAttention.map((ext: any) => (
              <ExtractionReviewCard
                key={ext.id}
                extraction={ext}
                entities={entities ?? []}
                categories={categories ?? []}
                periods={periods ?? []}
                bankAccounts={(bankAccounts ?? []) as any /* Supabase join returns entities as array */}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Uploads */}
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Recent Uploads</h2>
        <div className="space-y-2">
          {(documents ?? []).map((doc: any) => (
            <div key={doc.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium">{doc.filename}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(doc.created_at).toLocaleDateString('en-NZ')} · {Math.round(doc.file_size / 1024)}KB
                  </p>
                </div>
              </div>
              <Badge variant={
                doc.status === 'confirmed' ? 'success' :
                doc.status === 'failed' ? 'danger' :
                doc.status === 'ready_for_review' ? 'warning' : 'manual'
              }>
                {doc.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

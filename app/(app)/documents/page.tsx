import { createClient } from '@/lib/supabase/server'
import { UploadZone } from '@/components/documents/upload-zone'
import { ExtractionReviewCard } from '@/components/documents/extraction-review-card'
import { Badge } from '@/components/ui/badge'

export default async function DocumentsPage() {
  const supabase = await createClient()

  const [
    { data: documents },
    { data: pendingExtractions },
    { data: entities },
    { data: categories },
    { data: periods },
    { data: bankAccounts },
  ] = await Promise.all([
    supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('document_extractions').select('*, documents(filename)').eq('is_confirmed', false).eq('is_dismissed', false).order('created_at', { ascending: false }),
    supabase.from('entities').select('id, name').order('name'),
    supabase.from('categories').select('id, name, code, flow_direction').order('sort_order'),
    supabase.from('forecast_periods').select('id, week_ending').order('week_ending'),
    supabase.from('bank_accounts').select('id, name, entity_id, account_number, account_type, entities(name)').eq('is_active', true).order('name'),
  ])

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>

      <UploadZone />

      {pendingExtractions && pendingExtractions.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">
            Pending Review
            <Badge variant="warning" className="ml-2">{pendingExtractions.length}</Badge>
          </h2>
          <div className="space-y-2">
            {pendingExtractions.map((ext: any) => (
              <ExtractionReviewCard
                key={ext.id}
                extraction={ext}
                entities={entities ?? []}
                categories={categories ?? []}
                periods={periods ?? []}
                bankAccounts={bankAccounts ?? []}
              />
            ))}
          </div>
        </div>
      )}

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

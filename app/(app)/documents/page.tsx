import { createClient } from '@/lib/supabase/server'
import { UploadZone } from '@/components/documents/upload-zone'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

export default async function DocumentsPage() {
  const supabase = await createClient()

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: pendingExtractions } = await supabase
    .from('document_extractions')
    .select('*, documents(filename)')
    .eq('is_confirmed', false)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })

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
              <div key={ext.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
                <div>
                  <p className="text-sm font-medium">{ext.counterparty ?? 'Unknown'}</p>
                  <p className="text-xs text-zinc-500">
                    {ext.documents?.filename} · {ext.invoice_number ?? 'No invoice #'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">
                    {ext.amount ? formatCurrency(ext.amount) : '—'}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {ext.expected_date ?? 'No date'}
                  </span>
                </div>
              </div>
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

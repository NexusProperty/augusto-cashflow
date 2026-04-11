import { createClient } from '@/lib/supabase/server'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: groups } = await supabase.from('entity_groups').select('*, entities(*)')
  const { data: accounts } = await supabase.from('bank_accounts').select('*, entities(name)')

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>

      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Entity Groups</h2>
        {(groups ?? []).map((g: any) => (
          <div key={g.id} className="mb-2 rounded-lg border border-border bg-surface-raised p-4">
            <p className="font-medium">{g.name}</p>
            <p className="text-xs text-text-muted">
              {g.entities?.map((e: any) => e.name).join(', ')}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Bank Accounts</h2>
        <div className="space-y-2">
          {(accounts ?? []).map((a: any) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-raised p-3">
              <div>
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-text-muted">{a.entities?.name}</p>
              </div>
              {a.od_limit > 0 && (
                <span className="text-xs text-text-muted">OD Limit: ${a.od_limit.toLocaleString()}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

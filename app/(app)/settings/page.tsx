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
          <div key={g.id} className="mb-2 rounded-lg border border-zinc-200 bg-white p-4">
            <p className="font-medium text-zinc-900">{g.name}</p>
            <p className="text-xs text-zinc-500">
              {g.entities?.map((e: any) => e.name).join(', ')}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Bank Accounts</h2>
        <div className="space-y-2">
          {(accounts ?? []).map((a: any) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{a.name}</p>
                <p className="text-xs text-zinc-500">{a.entities?.name}</p>
              </div>
              {a.od_limit > 0 && (
                <span className="text-xs text-zinc-500">OD Limit: ${a.od_limit.toLocaleString()}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

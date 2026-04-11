import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'

export default async function ScenariosPage() {
  const supabase = await createClient()
  const { data: scenarios } = await supabase.from('scenarios').select('*').order('created_at')

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Scenarios</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Create forecast variations. Scenarios adjust pipeline confidence and recurring rules without duplicating the entire forecast.
      </p>
      <div className="space-y-2">
        {(scenarios ?? []).map((s: any) => (
          <div key={s.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="font-medium text-zinc-900">
              {s.name}
              {s.is_default && <Badge variant="success" className="ml-2">Default</Badge>}
            </p>
            <p className="text-sm text-zinc-500">{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

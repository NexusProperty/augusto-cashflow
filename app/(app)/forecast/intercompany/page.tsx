import { createClient } from '@/lib/supabase/server'
import { Tabs } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/utils'

const forecastTabs = [
  { label: 'Augusto Group', href: '/forecast' },
  { label: 'Coachmate', href: '/forecast/coachmate' },
  { label: 'Intercompany', href: '/forecast/intercompany' },
]

export default async function IntercompanyPage() {
  const supabase = await createClient()
  const { data: balances } = await supabase
    .from('intercompany_balances')
    .select('*, from_group:entity_groups!from_group_id(name), to_group:entity_groups!to_group_id(name)')
    .order('as_at_date', { ascending: false })

  const total = (balances ?? []).reduce((sum, b: any) => sum + b.amount, 0)

  return (
    <div>
      <div className="mb-4"><h1 className="text-xl font-semibold">Intercompany Balances</h1></div>
      <Tabs tabs={forecastTabs} />

      <div className="mt-4 rounded-lg border border-border bg-surface-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs text-text-muted">From</th>
              <th className="px-4 py-3 text-left text-xs text-text-muted">To</th>
              <th className="px-4 py-3 text-left text-xs text-text-muted">Description</th>
              <th className="px-4 py-3 text-right text-xs text-text-muted">Amount</th>
              <th className="px-4 py-3 text-right text-xs text-text-muted">As At</th>
            </tr>
          </thead>
          <tbody>
            {(balances ?? []).map((b: any) => (
              <tr key={b.id} className="border-b border-border/50">
                <td className="px-4 py-3">{b.from_group?.name}</td>
                <td className="px-4 py-3">{b.to_group?.name}</td>
                <td className="px-4 py-3">{b.description}</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(b.amount)}</td>
                <td className="px-4 py-3 text-right text-text-muted">{b.as_at_date}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <td colSpan={3} className="px-4 py-3">Total Owed</td>
              <td className="px-4 py-3 text-right">{formatCurrency(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

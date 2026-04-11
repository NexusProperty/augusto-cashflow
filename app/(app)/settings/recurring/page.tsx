import { createClient } from '@/lib/supabase/server'
import { RecurringRuleForm } from '@/components/settings/recurring-rule-form'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

export default async function RecurringRulesPage() {
  const supabase = await createClient()

  const [{ data: rules }, { data: entities }, { data: categories }] = await Promise.all([
    supabase.from('recurring_rules').select('*, entities(name, code)').order('created_at'),
    supabase.from('entities').select('*').eq('is_active', true).order('name'),
    supabase.from('categories').select('*').not('parent_id', 'is', null).order('sort_order'),
  ])

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Recurring Rules</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Define repeating items (payroll, rent, PAYE, loans). These auto-generate forecast lines.
      </p>

      <RecurringRuleForm entities={entities ?? []} categories={categories ?? []} />

      <div className="mt-6 space-y-2">
        {(rules ?? []).map((rule: any) => (
          <div key={rule.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4">
            <div>
              <p className="text-sm font-medium">
                {rule.description}
                <Badge variant="recurring" className="ml-2">{rule.frequency}</Badge>
                {!rule.is_active && <Badge variant="manual" className="ml-2">Paused</Badge>}
              </p>
              <p className="text-xs text-zinc-500">
                {rule.entities?.name} · From {rule.anchor_date}
                {rule.end_date && ` to ${rule.end_date}`}
              </p>
            </div>
            <span className={`text-sm font-semibold ${rule.amount < 0 ? 'text-red-600' : 'text-zinc-900'}`}>
              {formatCurrency(rule.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

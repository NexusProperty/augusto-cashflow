import { createAdminClient } from '@/lib/supabase/admin'

export interface ReferenceData {
  entities: { id: string; name: string }[]
  bankAccounts: { id: string; name: string; account_number: string | null; entity_id: string; entities: { name: string } | null }[]
  categories: { id: string; name: string; code: string; flow_direction: string }[]
  periods: { id: string; week_ending: string }[]
}

export async function fetchReferenceData(): Promise<ReferenceData> {
  const supabase = createAdminClient()

  const [
    { data: entities },
    { data: bankAccounts },
    { data: categories },
    { data: periods },
  ] = await Promise.all([
    supabase.from('entities').select('id, name').order('name'),
    supabase
      .from('bank_accounts')
      .select('id, name, account_number, entity_id, entities(name)')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, code, flow_direction')
      .not('flow_direction', 'in', '("balance","computed")')
      .not('code', 'in', '("inflows","outflows","loans","closing")')
      .order('sort_order'),
    supabase
      .from('forecast_periods')
      .select('id, week_ending')
      .gte('week_ending', new Date().toISOString().slice(0, 10))
      .order('week_ending')
      .limit(18),
  ])

  // Cast: database.types.ts is stale — missing account_number, flow_direction may be nullable
  return {
    entities: entities ?? [],
    bankAccounts: (bankAccounts as unknown as ReferenceData['bankAccounts']) ?? [],
    categories: (categories as unknown as ReferenceData['categories']) ?? [],
    periods: periods ?? [],
  }
}

export function formatReferenceDataForPrompt(data: ReferenceData): string {
  const sections: string[] = []

  sections.push('ENTITIES:')
  if (data.entities.length > 0) {
    data.entities.forEach(e => sections.push(`- ${e.name.toLowerCase()}`))
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('BANK ACCOUNTS:')
  if (data.bankAccounts.length > 0) {
    data.bankAccounts.forEach(ba => {
      const entity = ba.entities?.name ?? 'Unknown'
      sections.push(`- ${ba.account_number ?? 'no-number'} | ${ba.name} | Entity: ${entity}`)
    })
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('CATEGORIES:')
  sections.push('(use the code value in categoryCode)')
  if (data.categories.length > 0) {
    data.categories.forEach(c => sections.push(`- ${c.code} | ${c.name} | ${c.flow_direction}`))
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('FORECAST PERIODS:')
  sections.push('(use the date in suggestedWeekEnding)')
  if (data.periods.length > 0) {
    data.periods.forEach(p => sections.push(`- ${p.week_ending}`))
  } else {
    sections.push('(none)')
  }

  sections.push('')
  sections.push('VALID LINE STATUSES (use in suggestedStatus):')
  sections.push('- confirmed — Payment/receipt confirmed')
  sections.push('- tbc — Expected but not yet invoiced')
  sections.push('- awaiting_payment — Invoice raised, payment pending')
  sections.push('- paid — Payment cleared')
  sections.push('- remittance_received — Remittance advice received')
  sections.push('- speculative — Estimate or board paper')
  sections.push('- awaiting_budget_approval — Budget request pending approval')

  return sections.join('\n')
}

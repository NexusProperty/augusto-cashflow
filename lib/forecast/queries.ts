import type { ForecastLine, Period, Category, EntityGroup } from '@/lib/types'
import type { RecurringRule } from '@/lib/forecast/recurring'

export async function loadForecastData(
  supabase: any,
  groupId: string,
) {
  // Fetch entityGroup and entities first — lines query depends on entity IDs
  const [
    { data: entityGroup },
    { data: entities },
  ] = await Promise.all([
    supabase.from('entity_groups').select('*').eq('id', groupId).single(),
    supabase.from('entities').select('*').eq('group_id', groupId).eq('is_active', true),
  ])

  const entityIds = (entities ?? []).map((e: any) => e.id)

  // Now fetch everything that depends on resolved entity IDs
  const [
    { data: periods },
    { data: categories },
    { data: lines },
    { data: rules },
  ] = await Promise.all([
    supabase.from('forecast_periods').select('*').order('week_ending', { ascending: true }).limit(18),
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    entityIds.length > 0
      ? supabase.from('forecast_lines').select('*').in('entity_id', entityIds)
      : Promise.resolve({ data: [] }),
    supabase.from('recurring_rules').select('*').eq('is_active', true),
  ])

  return {
    entityGroup: entityGroup as EntityGroup,
    entities: entities ?? [],
    periods: (periods ?? []) as Period[],
    categories: (categories ?? []) as Category[],
    lines: (lines ?? []) as ForecastLine[],
    rules: (rules ?? []) as RecurringRule[],
  }
}

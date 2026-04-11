import type { ForecastLine, Period, Category, EntityGroup } from '@/lib/types'
import type { RecurringRule } from '@/lib/forecast/recurring'

// Map DB snake_case rows to app camelCase types
function mapEntityGroup(row: any): EntityGroup {
  return {
    id: row.id,
    name: row.name,
    odFacilityLimit: row.od_facility_limit ?? 0,
  }
}

function mapPeriod(row: any): Period {
  return {
    id: row.id,
    weekEnding: row.week_ending,
    isActual: row.is_actual ?? false,
  }
}

function mapCategory(row: any): Category {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    code: row.code,
    sectionNumber: row.section_number,
    sortOrder: row.sort_order ?? 0,
    flowDirection: row.flow_direction ?? 'inflow',
  }
}

function mapForecastLine(row: any): ForecastLine {
  return {
    id: row.id,
    entityId: row.entity_id,
    categoryId: row.category_id,
    periodId: row.period_id,
    amount: Number(row.amount) || 0,
    confidence: row.confidence ?? 100,
    source: row.source ?? 'manual',
    counterparty: row.counterparty,
    notes: row.notes,
    sourceDocumentId: row.source_document_id,
    sourceRuleId: row.source_rule_id,
    lineStatus: row.line_status ?? 'confirmed',
  }
}

function mapRecurringRule(row: any): RecurringRule {
  return {
    id: row.id,
    entityId: row.entity_id,
    categoryId: row.category_id,
    description: row.description,
    amount: Number(row.amount) || 0,
    frequency: row.frequency,
    anchorDate: row.anchor_date,
    dayOfMonth: row.day_of_month,
    endDate: row.end_date,
    isActive: row.is_active ?? true,
    counterparty: row.counterparty,
  }
}

export async function loadForecastData(
  supabase: any,
  groupId: string,
): Promise<{
  entityGroup: EntityGroup
  entities: any[]
  periods: Period[]
  categories: Category[]
  lines: ForecastLine[]
  rules: RecurringRule[]
}> {
  // Fetch everything in parallel — periods and categories don't depend on entity IDs,
  // so they go in the same batch. Lines depend on entityIds, resolved after the batch.
  const [
    { data: rawEntityGroup },
    { data: rawEntities },
    { data: rawPeriods },
    { data: rawCategories },
    { data: rawRules },
  ] = await Promise.all([
    supabase.from('entity_groups').select('*').eq('id', groupId).single(),
    supabase.from('entities').select('*').eq('group_id', groupId).eq('is_active', true),
    supabase.from('forecast_periods').select('*').order('week_ending', { ascending: true }).limit(18),
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('recurring_rules').select('*').eq('is_active', true),
  ])

  const entityIds = (rawEntities ?? []).map((e: any) => e.id)

  const { data: rawLines } = entityIds.length > 0
    ? await supabase.from('forecast_lines').select('*').in('entity_id', entityIds)
    : { data: [] as any[] }

  return {
    entityGroup: rawEntityGroup ? mapEntityGroup(rawEntityGroup) : { id: groupId, name: '', odFacilityLimit: 0 },
    entities: rawEntities ?? [],
    periods: (rawPeriods ?? []).map(mapPeriod),
    categories: (rawCategories ?? []).map(mapCategory),
    lines: (rawLines ?? []).map(mapForecastLine),
    rules: (rawRules ?? []).map(mapRecurringRule),
  }
}

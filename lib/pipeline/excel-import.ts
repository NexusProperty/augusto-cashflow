import ExcelJS from 'exceljs'
import type { PipelineStage } from '@/lib/types'

// ---------------------------------------------------------------------------
// Sheet → entity code mapping
// ---------------------------------------------------------------------------

const SHEET_ENTITY_MAP: Record<string, string> = {
  'AUGUSTO': 'AUG',
  'CORNERSTORE 202627': 'CNR',
  'BALLYHOO': 'BAL',
  'DARK DORIS': 'DD',
  'WRESTLER': 'WRS',
}

// ---------------------------------------------------------------------------
// FY2027 month → ISO date
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, string> = {
  april: '2026-04-01',
  may: '2026-05-01',
  june: '2026-06-01',
  july: '2026-07-01',
  august: '2026-08-01',
  september: '2026-09-01',
  october: '2026-10-01',
  november: '2026-11-01',
  december: '2026-12-01',
  january: '2027-01-01',
  february: '2027-02-01',
  march: '2027-03-01',
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImportedProject {
  entityCode: string
  clientName: string
  jobNumber: string | null
  projectName: string
  taskEstimate: string | null
  stage: PipelineStage
  teamMember: string | null
  billingAmount: number | null
  thirdPartyCosts: number | null
  notes: string | null
  allocations: { month: string; amount: number }[]
}

export interface ImportedTarget {
  entityCode: string
  month: string
  amount: number
}

export interface ImportResult {
  projects: ImportedProject[]
  targets: ImportedTarget[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// Stage mapper (exported for unit testing)
// ---------------------------------------------------------------------------

export function mapExcelStage(raw: string): PipelineStage {
  const s = (raw ?? '').trim().toLowerCase()
  if (s === 'confirmed') return 'confirmed'
  if (s.startsWith('awaiting budget approval')) return 'awaiting_approval'
  if (s.startsWith('upcoming work')) return 'upcoming'
  if (s === 'speculative') return 'speculative'
  if (s === 'declined') return 'declined'
  return 'speculative'
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function getCellString(cell: ExcelJS.Cell): string {
  if (cell == null) return ''
  const v = cell.value
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  // Formula result
  if (typeof v === 'object') {
    // RichTextValue
    if ('richText' in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((rt: any) => rt.text ?? '').join('').trim()
    }
    // FormulaValue with result
    if ('result' in v) {
      const r = (v as any).result
      if (r == null) return ''
      if (typeof r === 'string') return r.trim()
      if (typeof r === 'number') return String(r)
      return ''
    }
    // Date
    if (v instanceof Date) return ''
  }
  return ''
}

function getCellNumber(cell: ExcelJS.Cell): number | null {
  if (cell == null) return null
  const v = cell.value
  if (v == null) return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  if (typeof v === 'object') {
    // FormulaValue with numeric result
    if ('result' in v) {
      const r = (v as any).result
      if (typeof r === 'number') return isNaN(r) ? null : r
      return null
    }
  }
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''))
    return isNaN(n) ? null : n
  }
  return null
}

// ---------------------------------------------------------------------------
// Sheet parser
// ---------------------------------------------------------------------------

function parseSheet(
  sheet: ExcelJS.Worksheet,
  entityCode: string,
): { projects: ImportedProject[]; targets: ImportedTarget[]; errors: string[] } {
  const projects: ImportedProject[] = []
  const targets: ImportedTarget[] = []
  const errors: string[] = []

  // Step 1: Find the month header row (first row in rows 1-20 with 10+ month names)
  let monthHeaderRowNumber = -1
  const monthColMap: Record<number, string> = {} // col index → ISO date

  const maxScanRows = Math.min(20, sheet.rowCount)
  for (let r = 1; r <= maxScanRows; r++) {
    const row = sheet.getRow(r)
    let matchCount = 0
    const tempMap: Record<number, string> = {}

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = getCellString(cell).toLowerCase()
      if (MONTH_MAP[text]) {
        tempMap[colNumber] = MONTH_MAP[text]
        matchCount++
      }
    })

    if (matchCount >= 6) {
      monthHeaderRowNumber = r
      Object.assign(monthColMap, tempMap)
      break
    }
  }

  if (monthHeaderRowNumber === -1) {
    errors.push(`[${entityCode}] Could not find month header row`)
    return { projects, targets, errors }
  }

  const monthCols = Object.keys(monthColMap).map(Number).sort((a, b) => a - b)

  // Step 2: Find target row (has "target" text in one of the first 5 columns)
  let targetRowNumber = -1
  for (let r = monthHeaderRowNumber + 1; r <= Math.min(monthHeaderRowNumber + 10, sheet.rowCount); r++) {
    const row = sheet.getRow(r)
    for (let c = 1; c <= 5; c++) {
      const text = getCellString(row.getCell(c)).toLowerCase()
      if (text.includes('target')) {
        targetRowNumber = r
        break
      }
    }
    if (targetRowNumber !== -1) break
  }

  // Step 3: Extract targets
  if (targetRowNumber !== -1) {
    const targetRow = sheet.getRow(targetRowNumber)
    for (const col of monthCols) {
      const amount = getCellNumber(targetRow.getCell(col))
      if (amount != null && amount > 0) {
        targets.push({ entityCode, month: monthColMap[col], amount })
      }
    }
  }

  // Step 4: Scan project data rows
  // Data starts after the later of the header row and target row
  const dataStartRow = Math.max(monthHeaderRowNumber, targetRowNumber === -1 ? monthHeaderRowNumber : targetRowNumber) + 1

  // We need to understand the column layout. Heuristic: look at the header row context.
  // Based on the spec, typical layout:
  //   col 1: job number or client header text
  //   col 2: project name or sub-description
  //   col 3: task estimate
  //   col 4: stage
  //   col 5: team member / billing amount
  //   then monthly cols
  // We'll detect this by looking at the header row and the data rows.

  // Find the first month column index
  const firstMonthCol = monthCols[0] ?? 99

  // Determine the column layout based on position of month columns
  // Columns before the first month column are metadata columns
  const metaCols = firstMonthCol - 1 // number of metadata cols

  let currentClientName = ''

  for (let r = dataStartRow; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)

    // Get all cell values for meta columns
    const cellValues: string[] = []
    for (let c = 1; c < firstMonthCol; c++) {
      cellValues.push(getCellString(row.getCell(c)))
    }

    // Skip completely empty rows
    const allEmpty = cellValues.every((v) => v === '') &&
      monthCols.every((c) => getCellNumber(row.getCell(c)) == null)
    if (allEmpty) continue

    // Skip rows that look like totals
    const firstCellText = cellValues[0]?.toLowerCase() ?? ''
    if (
      firstCellText.startsWith('total') ||
      firstCellText === 'grand total' ||
      firstCellText === 'subtotal'
    ) continue

    // Check if this is a client header row: text in first cell, no amounts in month cols
    const hasMonthAmounts = monthCols.some((c) => {
      const n = getCellNumber(row.getCell(c))
      return n != null && n !== 0
    })

    // Detect client header: text in col 1, no month amounts, and col 2 is empty or also a label
    // A client header is a row where the entire row is just a name with no numeric data
    const col1Text = cellValues[0] ?? ''
    const col2Text = cellValues[1] ?? ''
    const col3Text = cellValues[2] ?? ''

    // If no month amounts and col1 has text (and it's not a stage value)
    const isStageValue = ['confirmed', 'awaiting_approval', 'upcoming', 'speculative', 'declined'].includes(
      mapExcelStage(col1Text) !== 'speculative' ? col1Text.toLowerCase() : '',
    )

    if (!hasMonthAmounts && col1Text && !isStageValue) {
      // Likely a client header row — check if it looks like a project row
      // If all meta cells beyond col1 are empty, treat as client header
      const metaAfterFirst = cellValues.slice(1)
      if (metaAfterFirst.every((v) => v === '')) {
        currentClientName = col1Text
        continue
      }
    }

    // This is a project row — extract data
    // Layout detection based on number of metadata columns
    let jobNumber: string | null = null
    let projectName = ''
    let taskEstimate: string | null = null
    let stageRaw = ''
    let teamMember: string | null = null
    let billingAmount: number | null = null
    let thirdPartyCosts: number | null = null
    let notes: string | null = null

    if (metaCols >= 8) {
      // Larger layout: col1=job, col2=project, col3=task, col4=stage, col5=team, col6=billing, col7=3p, col8=notes
      jobNumber = col1Text || null
      projectName = col2Text
      taskEstimate = cellValues[2] || null
      stageRaw = cellValues[3] ?? ''
      teamMember = cellValues[4] || null
      billingAmount = getCellNumber(row.getCell(6))
      thirdPartyCosts = getCellNumber(row.getCell(7))
      notes = cellValues[7] || null
    } else if (metaCols >= 6) {
      // col1=job, col2=project, col3=task, col4=stage, col5=team, col6=billing
      jobNumber = col1Text || null
      projectName = col2Text
      taskEstimate = cellValues[2] || null
      stageRaw = cellValues[3] ?? ''
      teamMember = cellValues[4] || null
      billingAmount = getCellNumber(row.getCell(6))
    } else if (metaCols >= 4) {
      // col1=job, col2=project, col3=stage, col4=team
      jobNumber = col1Text || null
      projectName = col2Text
      stageRaw = cellValues[2] ?? ''
      teamMember = cellValues[3] || null
    } else if (metaCols >= 3) {
      // col1=project, col2=stage, col3=team
      projectName = col1Text
      stageRaw = col2Text
      teamMember = cellValues[2] || null
    } else {
      // col1=project, col2=stage
      projectName = col1Text
      stageRaw = col2Text
    }

    // Skip if no project name and no client
    if (!projectName && !currentClientName) continue

    // Use client name as project name fallback if project name is blank but we have amounts
    if (!projectName && hasMonthAmounts) {
      projectName = `${currentClientName} (unnamed project)`
    }

    // Skip rows without a project name
    if (!projectName) continue

    // Extract monthly allocations
    const allocations: { month: string; amount: number }[] = []
    for (const col of monthCols) {
      const amount = getCellNumber(row.getCell(col))
      if (amount != null && amount !== 0) {
        allocations.push({ month: monthColMap[col], amount })
      }
    }

    // Skip rows that look like section headers (no amounts, no stage, project name looks like a label)
    if (allocations.length === 0 && !stageRaw) continue

    const stage = mapExcelStage(stageRaw)

    projects.push({
      entityCode,
      clientName: currentClientName || projectName,
      jobNumber: jobNumber || null,
      projectName,
      taskEstimate: taskEstimate || null,
      stage,
      teamMember: teamMember || null,
      billingAmount: billingAmount ?? null,
      thirdPartyCosts: thirdPartyCosts ?? null,
      notes: notes || null,
      allocations,
    })
  }

  return { projects, targets, errors }
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export async function parseRevenueTracker(buffer: ArrayBuffer): Promise<ImportResult> {
  const allProjects: ImportedProject[] = []
  const allTargets: ImportedTarget[] = []
  const allErrors: string[] = []

  try {
    const workbook = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(buffer) as any)

    for (const [sheetName, entityCode] of Object.entries(SHEET_ENTITY_MAP)) {
      // Try exact match first, then case-insensitive
      let sheet = workbook.getWorksheet(sheetName)
      if (!sheet) {
        const lower = sheetName.toLowerCase()
        workbook.eachSheet((ws) => {
          if (!sheet && ws.name.toLowerCase() === lower) {
            sheet = ws
          }
        })
      }
      if (!sheet) {
        allErrors.push(`Sheet "${sheetName}" not found — skipped`)
        continue
      }

      try {
        const result = parseSheet(sheet, entityCode)
        allProjects.push(...result.projects)
        allTargets.push(...result.targets)
        allErrors.push(...result.errors)
      } catch (err) {
        allErrors.push(`[${entityCode}] Parse error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    allErrors.push(`Failed to open workbook: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { projects: allProjects, targets: allTargets, errors: allErrors }
}

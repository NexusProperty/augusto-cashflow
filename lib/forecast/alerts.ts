import type { WeekSummary, ForecastLine, ForecastAlert } from '@/lib/types'

export function detectAlerts(
  summaries: WeekSummary[],
  lines: ForecastLine[],
): ForecastAlert[] {
  const alerts: ForecastAlert[] = []

  for (const week of summaries) {
    // OD breach
    if (week.isOverdrawn) {
      alerts.push({
        type: 'od_breach',
        periodId: week.periodId,
        message: `Overdrawn by ${formatAbs(week.availableCash)} — exceeds OD facility`,
        severity: 'danger',
      })
    }

    // Cash cliff: any single line > 20% of absolute closing balance (min $50k)
    const periodLines = lines.filter((l) => l.periodId === week.periodId)
    const threshold = Math.max(Math.abs(week.closingBalance) * 0.2, 50000)

    for (const line of periodLines) {
      if (Math.abs(line.amount) > threshold) {
        alerts.push({
          type: 'cash_cliff',
          periodId: week.periodId,
          message: `Large item: ${formatAbs(line.amount)} from ${line.counterparty ?? 'unknown'}`,
          severity: Math.abs(line.amount) > threshold * 2 ? 'danger' : 'warning',
          lineId: line.id,
        })
      }
    }
  }

  // Material week-on-week change (> 50% swing in closing balance)
  for (let i = 1; i < summaries.length; i++) {
    const prev = summaries[i - 1].closingBalance
    const curr = summaries[i].closingBalance
    if (prev !== 0) {
      const change = Math.abs((curr - prev) / prev)
      if (change > 0.5) {
        alerts.push({
          type: 'material_change',
          periodId: summaries[i].periodId,
          message: `${change > 0 ? 'Swing' : 'Drop'} of ${Math.round(change * 100)}% from previous week`,
          severity: 'warning',
        })
      }
    }
  }

  return alerts
}

function formatAbs(n: number): string {
  return `$${Math.abs(n).toLocaleString('en-NZ')}`
}

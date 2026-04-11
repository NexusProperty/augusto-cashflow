export const DEFAULT_FY_START = 4

export function getFiscalYear(date: Date, fyStartMonth = DEFAULT_FY_START): number {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return month >= fyStartMonth ? year + 1 : year
}

export function getFiscalYearMonths(fy: number, fyStartMonth = DEFAULT_FY_START): string[] {
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const m = ((fyStartMonth - 1 + i) % 12) + 1
    const y = m >= fyStartMonth ? fy - 1 : fy
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
  }
  return months
}

export function getMonthLabel(monthStr: string): string {
  const labels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const m = parseInt(monthStr.slice(5, 7), 10)
  return labels[m - 1]
}

export function getWeeksInMonth(allWeekEndings: string[], monthStr: string): string[] {
  const year = parseInt(monthStr.slice(0, 4), 10)
  const month = parseInt(monthStr.slice(5, 7), 10)
  return allWeekEndings.filter((we) => {
    const weYear = parseInt(we.slice(0, 4), 10)
    const weMonth = parseInt(we.slice(5, 7), 10)
    return weYear === year && weMonth === month
  })
}

export function getCurrentFiscalYear(fyStartMonth = DEFAULT_FY_START): number {
  return getFiscalYear(new Date(), fyStartMonth)
}

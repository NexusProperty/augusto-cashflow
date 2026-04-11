import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-NZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return amount < 0 ? `-$${formatted}` : `$${formatted}`
}

export function formatCurrencyWithSign(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-NZ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  if (amount < 0) return `-$${formatted}`
  if (amount > 0) return `+$${formatted}`
  return '$0'
}

export function weekEndingLabel(date: Date): string {
  return `w/e ${date.toLocaleDateString('en-NZ', { day: '2-digit', month: 'short' })}`
}

export function isNegative(amount: number): boolean {
  return amount < 0
}

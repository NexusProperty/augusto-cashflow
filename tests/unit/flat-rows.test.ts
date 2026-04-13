import { describe, it, expect } from 'vitest'
import { buildFlatRows } from '@/lib/forecast/flat-rows'
import type { BankAccount, Category } from '@/lib/types'

// --- Fixtures ---------------------------------------------------------------

const mkCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'c',
  parentId: null,
  name: 'X',
  code: 'x',
  sectionNumber: null,
  sortOrder: 0,
  flowDirection: 'inflow',
  ...overrides,
})

const mkBank = (id: string, name: string): BankAccount => ({
  id,
  entityId: 'e1',
  name,
  accountType: null,
  accountNumber: null,
  odLimit: 0,
  openingBalance: 0,
  isActive: true,
  notes: null,
})

describe('buildFlatRows — bank-opening rows', () => {
  it('emits one bank-opening row per main bank in canonical order', () => {
    const balance = mkCategory({
      id: 'balance-sec',
      name: 'Opening Bank Balance',
      code: 'opening_balance',
      flowDirection: 'balance',
      sectionNumber: '1',
    })
    const banks: BankAccount[] = [
      // Intentionally out of canonical order to verify ordering.
      mkBank('b3', 'Augusto Commercial'),
      mkBank('b1', 'Augusto Current'),
      mkBank('b4', 'Dark Doris (Nets)'),
      mkBank('b2', 'Cornerstore'),
    ]
    const rows = buildFlatRows([balance], [balance], [], {}, undefined, banks)
    // sectionHeader + 4 bank rows
    expect(rows).toHaveLength(5)
    expect(rows[0]!.kind).toBe('sectionHeader')
    const kinds = rows.slice(1).map((r) => r.kind)
    expect(kinds).toEqual(['bank-opening', 'bank-opening', 'bank-opening', 'bank-opening'])
    const names = rows.slice(1).map((r) => (r.kind === 'bank-opening' ? r.bankName : ''))
    expect(names).toEqual([
      'Augusto Current',
      'Cornerstore',
      'Augusto Commercial',
      'Dark Doris (Nets)',
    ])
  })

  it('skips banks that are missing from the loaded list', () => {
    const balance = mkCategory({
      id: 'balance-sec',
      code: 'opening_balance',
      flowDirection: 'balance',
    })
    // Only two of the four main banks loaded.
    const banks: BankAccount[] = [
      mkBank('b1', 'Augusto Current'),
      mkBank('b2', 'Cornerstore'),
    ]
    const rows = buildFlatRows([balance], [balance], [], {}, undefined, banks)
    expect(rows).toHaveLength(3) // header + 2 bank rows
    expect(rows[1]!.kind).toBe('bank-opening')
    expect(rows[2]!.kind).toBe('bank-opening')
  })

  it('emits NO bank-opening rows when the section is not flow_direction=balance', () => {
    const inflow = mkCategory({
      id: 'inflows',
      code: 'inflows',
      flowDirection: 'inflow',
    })
    const banks: BankAccount[] = [mkBank('b1', 'Augusto Current')]
    const rows = buildFlatRows([inflow], [inflow], [], {}, undefined, banks)
    for (const r of rows) {
      expect(r.kind).not.toBe('bank-opening')
    }
  })

  it('no bankAccounts passed → no bank-opening rows even for balance sections', () => {
    const balance = mkCategory({
      id: 'balance-sec',
      code: 'opening_balance',
      flowDirection: 'balance',
    })
    const rows = buildFlatRows([balance], [balance], [], {})
    // Only sectionHeader — section body is empty.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe('sectionHeader')
  })

  it('collapsed balance section emits only the sectionHeader', () => {
    const balance = mkCategory({
      id: 'balance-sec',
      code: 'opening_balance',
      flowDirection: 'balance',
    })
    const banks: BankAccount[] = [mkBank('b1', 'Augusto Current')]
    const rows = buildFlatRows([balance], [balance], [], { 'balance-sec': true }, undefined, banks)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe('sectionHeader')
  })
})

import { describe, it, expect } from 'vitest'
import { computeWeekSummaries } from '@/lib/forecast/engine'
import type {
  ForecastLine,
  Period,
  Category,
  BankAccount,
} from '@/lib/types'
import { MAIN_FORECAST_BANK_NAMES } from '@/lib/forecast/constants'

// --- Fixtures ---------------------------------------------------------------

const bank = (
  id: string,
  name: string,
  openingBalance: number,
  overrides: Partial<BankAccount> = {},
): BankAccount => ({
  id,
  entityId: 'e1',
  name,
  accountType: null,
  accountNumber: null,
  odLimit: 0,
  openingBalance,
  isActive: true,
  notes: null,
  ...overrides,
})

const period = (id: string, weekEnding: string): Period => ({
  id,
  weekEnding,
  isActual: false,
})

const line = (
  id: string,
  periodId: string,
  amount: number,
  categoryId: string,
  bankAccountId: string | null,
): ForecastLine => ({
  id,
  entityId: 'e1',
  categoryId,
  periodId,
  amount,
  confidence: 100,
  source: 'manual',
  counterparty: null,
  notes: null,
  sourceDocumentId: null,
  sourceRuleId: null,
  sourcePipelineProjectId: null,
  lineStatus: 'confirmed',
  formula: null,
  bankAccountId,
})

const categories: Category[] = [
  { id: 'inflows', parentId: null, name: 'Inflows', code: 'inflows', sectionNumber: '2', sortOrder: 200, flowDirection: 'inflow' },
  { id: 'inflows_ar', parentId: 'inflows', name: 'AR', code: 'inflows_ar', sectionNumber: '2a', sortOrder: 210, flowDirection: 'inflow' },
  { id: 'outflows', parentId: null, name: 'Outflows', code: 'outflows', sectionNumber: '3', sortOrder: 300, flowDirection: 'outflow' },
  { id: 'outflows_payroll', parentId: 'outflows', name: 'Payroll', code: 'outflows_payroll', sectionNumber: '3a', sortOrder: 310, flowDirection: 'outflow' },
  { id: 'loans', parentId: null, name: 'Loans', code: 'loans', sectionNumber: '4', sortOrder: 400, flowDirection: 'outflow' },
]

const allMainBanks = (): BankAccount[] => [
  bank('bank-augusto', 'Augusto Current', 0),
  bank('bank-cornerstore', 'Cornerstore', 0),
  bank('bank-commercial', 'Augusto Commercial', 0),
  bank('bank-dark-doris', 'Dark Doris (Nets)', 0),
]

// --- Tests ------------------------------------------------------------------

describe('computeWeekSummaries — per-bank mode', () => {
  it('single bank, 3 weeks, opening 1000, no flows → opening and closing stay at 1000', () => {
    const periods = [
      period('p1', '2026-03-27'),
      period('p2', '2026-04-03'),
      period('p3', '2026-04-10'),
    ]
    const banks = allMainBanks()
    banks[0] = bank('bank-augusto', 'Augusto Current', 1000)

    const summaries = computeWeekSummaries(periods, [], categories, 0, false, banks)

    expect(summaries).toHaveLength(3)
    for (const s of summaries) {
      const augusto = s.byBank.find((b) => b.bankName === 'Augusto Current')!
      expect(augusto.openingBalance).toBe(1000)
      expect(augusto.netCashFlow).toBe(0)
      expect(augusto.closingBalance).toBe(1000)
      // Group opening = sum(byBank openings). Other banks all start at 0.
      expect(s.openingBalance).toBe(1000)
      expect(s.closingBalance).toBe(1000)
    }
  })

  it('2 banks, inflow on bank A → bank A closes higher, bank B unchanged', () => {
    const periods = [period('p1', '2026-03-27')]
    const banks = allMainBanks()
    banks[0] = bank('bank-augusto', 'Augusto Current', 500)
    banks[1] = bank('bank-cornerstore', 'Cornerstore', 200)

    const lines = [line('l1', 'p1', 300, 'inflows_ar', 'bank-augusto')]

    const [summary] = computeWeekSummaries(periods, lines, categories, 0, false, banks)
    const augusto = summary.byBank.find((b) => b.bankName === 'Augusto Current')!
    const cornerstore = summary.byBank.find((b) => b.bankName === 'Cornerstore')!

    expect(augusto.openingBalance).toBe(500)
    expect(augusto.netCashFlow).toBe(300)
    expect(augusto.closingBalance).toBe(800)

    expect(cornerstore.openingBalance).toBe(200)
    expect(cornerstore.netCashFlow).toBe(0)
    expect(cornerstore.closingBalance).toBe(200)

    // Group totals = sum(byBank).
    expect(summary.openingBalance).toBe(700) // 500 + 200 (+ 0 + 0)
    expect(summary.closingBalance).toBe(1000) // 800 + 200
  })

  it('default-bank fallback: untagged line flows into Augusto Current', () => {
    const periods = [period('p1', '2026-03-27')]
    const banks = allMainBanks()
    banks[0] = bank('bank-augusto', 'Augusto Current', 100)

    // bankAccountId: null
    const lines = [line('l1', 'p1', 250, 'inflows_ar', null)]

    const [summary] = computeWeekSummaries(periods, lines, categories, 0, false, banks)
    const augusto = summary.byBank.find((b) => b.bankName === 'Augusto Current')!
    expect(augusto.netCashFlow).toBe(250)
    expect(augusto.closingBalance).toBe(350)
  })

  it('Coachmate-tagged lines are excluded from byBank AND from group totals', () => {
    const periods = [period('p1', '2026-03-27')]
    const banks = allMainBanks()
    banks[0] = bank('bank-augusto', 'Augusto Current', 1000)

    // 500 into Augusto Current, 999 into Coachmate (non-main) — must be ignored.
    const lines = [
      line('l1', 'p1', 500, 'inflows_ar', 'bank-augusto'),
      line('l2', 'p1', 999, 'inflows_ar', 'bank-coachmate'),
    ]

    const [summary] = computeWeekSummaries(periods, lines, categories, 0, false, banks)

    // Coachmate not in byBank.
    expect(summary.byBank.find((b) => b.bankName === 'Augusto Current')!.closingBalance).toBe(1500)
    expect(summary.byBank.some((b) => b.bankAccountId === 'bank-coachmate')).toBe(false)
    // Coachmate flow excluded from group inflows.
    expect(summary.totalInflows).toBe(500)
    // Group closing = sum(byBank) = 1500 + 0 + 0 + 0.
    expect(summary.closingBalance).toBe(1500)
  })

  it('cascade: closing[w] of bank X becomes opening[w+1] of bank X', () => {
    const periods = [
      period('p1', '2026-03-27'),
      period('p2', '2026-04-03'),
      period('p3', '2026-04-10'),
    ]
    const banks = allMainBanks()
    banks[0] = bank('bank-augusto', 'Augusto Current', 1000)

    const lines = [
      line('l1', 'p1', 100, 'inflows_ar', 'bank-augusto'),
      line('l2', 'p2', -50, 'outflows_payroll', 'bank-augusto'),
      line('l3', 'p3', 200, 'inflows_ar', 'bank-augusto'),
    ]

    const summaries = computeWeekSummaries(periods, lines, categories, 0, false, banks)

    const a = (i: number) =>
      summaries[i].byBank.find((b) => b.bankName === 'Augusto Current')!

    expect(a(0).openingBalance).toBe(1000)
    expect(a(0).closingBalance).toBe(1100)

    expect(a(1).openingBalance).toBe(1100)
    expect(a(1).closingBalance).toBe(1050)

    expect(a(2).openingBalance).toBe(1050)
    expect(a(2).closingBalance).toBe(1250)
  })

  it('byBank is ordered to match MAIN_FORECAST_BANK_NAMES', () => {
    const periods = [period('p1', '2026-03-27')]
    // Pass banks in REVERSE render order to prove the engine reorders.
    const banks: BankAccount[] = [
      bank('bank-dark-doris', 'Dark Doris (Nets)', 4),
      bank('bank-commercial', 'Augusto Commercial', 3),
      bank('bank-cornerstore', 'Cornerstore', 2),
      bank('bank-augusto', 'Augusto Current', 1),
    ]

    const [summary] = computeWeekSummaries(periods, [], categories, 0, false, banks)
    const names = summary.byBank.map((b) => b.bankName)
    expect(names).toEqual([...MAIN_FORECAST_BANK_NAMES])
  })

  it('per-bank mode group totals = legacy group totals MINUS coachmate flows', () => {
    // Same periods, same category set, same lines — but toggle per-bank mode
    // via the bankAccounts arg. The ex-Coachmate invariant: per-bank mode
    // silently drops any flow tagged to a non-main bank (Coachmate), so its
    // group totals should equal legacy totals minus the Coachmate amount.
    const periods = [period('p1', '2026-03-27'), period('p2', '2026-04-03')]
    const banks = allMainBanks()
    banks[0] = bank('bank-augusto', 'Augusto Current', 1000)
    banks[1] = bank('bank-cornerstore', 'Cornerstore', 500)
    // Coachmate is NOT in MAIN_FORECAST_BANK_NAMES so it won't be in the
    // per-bank set even though we pass it in.
    const coachmate = bank('bank-coachmate', 'Coachmate', 0)

    const coachmateAmount = 777
    const mainAmount = 300

    const linesNoCoachmate = [
      line('l1', 'p1', mainAmount, 'inflows_ar', 'bank-augusto'),
      line('l2', 'p2', -mainAmount / 2, 'outflows_payroll', 'bank-cornerstore'),
    ]
    const linesWithCoachmate = [
      ...linesNoCoachmate,
      line('lc', 'p1', coachmateAmount, 'inflows_ar', 'bank-coachmate'),
    ]

    // --- Case A: no Coachmate lines. Legacy === per-bank group totals. ---
    const legacyA = computeWeekSummaries(periods, linesNoCoachmate, categories, 0, false)
    const perBankA = computeWeekSummaries(periods, linesNoCoachmate, categories, 0, false, [
      ...banks,
      coachmate,
    ])

    for (let i = 0; i < periods.length; i++) {
      expect(perBankA[i].totalInflows).toBe(legacyA[i].totalInflows)
      expect(perBankA[i].totalOutflows).toBe(legacyA[i].totalOutflows)
      expect(perBankA[i].netOperating).toBe(legacyA[i].netOperating)
    }

    // --- Case B: WITH Coachmate. Per-bank totals = legacy totals MINUS coachmate. ---
    const legacyB = computeWeekSummaries(periods, linesWithCoachmate, categories, 0, false)
    const perBankB = computeWeekSummaries(periods, linesWithCoachmate, categories, 0, false, [
      ...banks,
      coachmate,
    ])

    // Coachmate is an inflow of `coachmateAmount` on period 0.
    expect(legacyB[0].totalInflows - perBankB[0].totalInflows).toBe(coachmateAmount)
    // Period 1 has no Coachmate flow → identical.
    expect(perBankB[1].totalInflows).toBe(legacyB[1].totalInflows)
    expect(perBankB[1].totalOutflows).toBe(legacyB[1].totalOutflows)
  })

  it('lines whose direction is "balance" are skipped (legacy pre-migration-024 safety)', () => {
    const periods = [period('p1', '2026-03-27')]
    const banks = allMainBanks()
    banks[0] = bank('bank-augusto', 'Augusto Current', 500)

    const legacyCategory: Category = {
      id: 'opening',
      parentId: null,
      name: 'Opening',
      code: 'opening',
      sectionNumber: '1',
      sortOrder: 100,
      flowDirection: 'balance',
    }
    const lines = [line('l1', 'p1', 99999, 'opening', 'bank-augusto')]

    const [summary] = computeWeekSummaries(
      periods,
      lines,
      [...categories, legacyCategory],
      0,
      false,
      banks,
    )
    const augusto = summary.byBank.find((b) => b.bankName === 'Augusto Current')!
    // Balance-direction line fully ignored — opening still = bank.openingBalance.
    expect(augusto.openingBalance).toBe(500)
    expect(augusto.netCashFlow).toBe(0)
    expect(augusto.closingBalance).toBe(500)
  })
})

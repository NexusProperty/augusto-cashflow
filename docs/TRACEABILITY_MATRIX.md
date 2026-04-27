# Traceability Matrix - Augusto

> Every requirement maps to a spec doc, an implementation file, a test, and an acceptance gate. Gaps are bugs.

**Project:** `augusto-cashflow`

---

| Requirement | Spec doc | Module / file | Test | Acceptance gate |
|---|---|---|---|---|
| AI document processing — extract financial data from xlsx/csv/pdf/docx via Claude | `docs/specs/2026-04-11-ai-processing-enhancement-design.md` | `supabase/functions/process-document/`, `lib/documents/extraction-schema.ts` | `tests/unit/extraction-prompt.test.ts`, `tests/unit/extraction-schema.test.ts` | Manual UAT — upload a known sample doc and confirm extracted lines match expected |
| Pipeline → Forecast auto-derivation (Confirmed Revenue + Third Party Costs) | `docs/specs/2026-04-12-revenue-pipeline-design.md` | `lib/pipeline/`, `lib/forecast/engine.ts` | `tests/unit/pipeline-entity-filter.test.ts`, `tests/unit/pipeline-excel-import.test.ts`, `tests/unit/forecast-engine.test.ts` | Manual UAT — mark a pipeline project confirmed, see Confirmed Revenue + Third Party Costs auto-populate the matching weeks |
| Excel-like grid editing (paste, fill-handle, formulas) | `docs/specs/2026-04-13-excel-like-grid-enhancements-design.md` | `lib/forecast/clipboard.ts`, `lib/forecast/fill-handle.ts`, `lib/forecast/formula.ts` | `tests/unit/clipboard-tsv.test.ts`, `tests/unit/fill-handle.test.ts`, `tests/unit/formula.test.ts`, `tests/unit/inline-cell-keyboard.test.ts` | Manual UAT — paste a 100-row TSV from Excel; confirm it lands and saves |
| Per-bank opening balances + bank chip on subtotals | `docs/plans/2026-04-14-per-bank-opening-balances.md` | `lib/forecast/per-bank-engine.ts`, `app/(app)/forecast/detail/` | `tests/unit/per-bank-engine.test.ts` | Manual UAT — set per-bank opening balances; confirm grid shows correct rollup |
| Pipeline summary grid affordances | `docs/plans/2026-04-14-pipeline-summary-grid-affordances.md` | `app/(app)/pipeline/`, `lib/pipeline/` | (covered indirectly by `pipeline-entity-filter.test.ts`) | Manual UAT — confirm pipeline grid renders status chips + filters |
| Table redesign | `docs/specs/2026-04-12-table-redesign-design.md` | `components/forecast/`, `app/(app)/forecast/detail/` | (UI — manual smoke) | Manual UAT |

**Coverage gaps surfaced:**
- Server Actions for forecast cell save are tested only at the engine layer (pure-function tests). No integration test exercises the full Server Action → Supabase round-trip. **Driving requirement for `tests/integration/` (REALITY-GAP / TEST_STRATEGY gap).**
- No e2e test exercises the upload → extract → confirm → forecast-update flow as a single path. Documents work and forecast work are tested separately at unit layer.

(Add rows as new features land. Each row should reach all five columns; gaps in the `Test` column become testing-strategy backlog.)

---

## How to read this

- **Requirement:** atomic capability the client agreed to.
- **Spec doc:** which `docs/system-formation/01-build-spec.md` section, or which `docs/adr/` decision, governs it.
- **Module / file:** primary implementation site (use a path, not a noun).
- **Test:** path + `it()` name of the test that proves it.
- **Acceptance gate:** the green light that lets it ship (manual sign-off, automated gate, both).

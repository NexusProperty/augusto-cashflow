# Integration tests

Per Mission Control project rule (CLAUDE.md §Testing standards): **integration tests hit a real Supabase instance, NOT mocks.**

This folder is empty pending the first integration test landing — see `docs/TEST_STRATEGY.md` row "Integration".

When you add the first test:

1. Create `vitest.integration.config.ts` in the project root. Mirror `vitest.config.ts` but point `include` at `tests/integration/**/*.{test,spec}.ts`.
2. Add a setup file that ensures local Supabase is running and the schema is up-to-date (`supabase start && supabase db reset`).
3. Drop unit-style mocks at the door — this layer talks to the database.
4. The first test target should be `documents.confirm` Server Action → verify forecast_lines insert + idempotency token rejects double-confirm (REALITY-GAP row 2).

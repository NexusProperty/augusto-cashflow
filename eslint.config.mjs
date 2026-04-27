// Authored 2026-04-28 as part of Mission Control PRB Phase 4.6 follow-up.
// ESLint 9 is flat-config only; this config bridges legacy `eslint-config-next`
// (still CommonJS in 15.2.x) via the FlatCompat adapter from @eslint/eslintrc.
// Both `next/core-web-vitals` and `next/typescript` are required: the former
// for Next.js best practices, the latter so existing
// `// eslint-disable-next-line @typescript-eslint/no-explicit-any` directives
// in source resolve.
//
// See Mission Control memory `feedback_next15_eslint_flatcompat` for context.
//
// Note on source-level errors surfaced by enabling lint: the previously-broken
// config (no eslint.config.mjs at all) was hiding ~55 real source errors. Those
// are tracked as a follow-up cleanup sprint — see PRB Phase 4.6 completion
// record. The pre-commit hook deliberately runs typecheck only (not lint)
// until that cleanup lands.

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const config = [
  {
    ignores: [
      'node_modules/',
      '.next/',
      '.vercel/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
      'supabase/functions/',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]

export default config

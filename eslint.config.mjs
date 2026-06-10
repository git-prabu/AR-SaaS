// eslint.config.mjs — ESLint 9 flat config.
//
// Migrated from .eslintrc.json when eslint-config-next was upgraded to
// v16 (which requires ESLint >= 9 and ships flat config natively — no
// FlatCompat shim needed). The custom rules below carry over unchanged
// from the old file.
import coreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  {
    // Generated / vendored / non-app paths. Must come first so the
    // ignores apply globally.
    ignores: [
      '.next/**',
      'node_modules/**',
      'functions/**',
      'public/firebase-messaging-sw.js',
      'public/sw.js',
      'scripts/**',
    ],
  },
  ...coreWebVitals,
  {
    rules: {
      'no-undef': 'error',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',

      // ── React Compiler preparation rules → warnings ─────────────
      // eslint-config-next 16 turned these on as errors. They flag
      // long-standing patterns (setState inside effects, Date.now()
      // in render, manual memoization shapes) that work correctly
      // without the React Compiler — 125 hits across 40 files at
      // upgrade time. Mass-refactoring working production code for a
      // compiler we don't run yet is risk without benefit, so they
      // are warnings: visible in `npm run lint` for gradual cleanup,
      // not blocking `npm run lint:errors`. Revisit if/when the
      // React Compiler is enabled.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

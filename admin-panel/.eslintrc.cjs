// ESLint config for the admin panel (React + TypeScript + Vite).
// Mirrors the backend philosophy: warnings are advisory and only genuine
// errors (e.g. React hook-rule violations) fail the build. Rules the existing
// codebase intentionally uses (`any` at API boundaries, etc.) are relaxed
// rather than churned through. TypeScript itself handles undefined-symbol
// checking, so `no-undef` is off to avoid false positives on types/globals.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  env: { browser: true, es2022: true, node: true, jest: true },
  settings: { react: { version: 'detect' } },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.cjs',
    '*.js',
    'vite.config.ts',
  ],
  rules: {
    // TS handles undefined symbols; the core rule false-positives on types/globals.
    'no-undef': 'off',
    // Pragmatic relaxations for this codebase (same spirit as the backend config).
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/ban-ts-comment': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-console': 'off',
    'prefer-const': 'warn',
    // Real-bug rules stay as errors.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
};

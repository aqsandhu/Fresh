// ESLint config for the backend (TypeScript, Node).
// The lint script runs `eslint src/**/*.ts` with no --max-warnings, so warnings
// are advisory and only genuine errors fail the build. Rules that the existing
// codebase intentionally uses (dynamic require for optional deps, `any` at
// integration boundaries) are relaxed rather than churned through.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, es2022: true, jest: true },
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '*.js', '*.cjs'],
  rules: {
    // Pragmatic relaxations for this codebase.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off', // optional deps loaded via require()
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    '@typescript-eslint/no-empty-function': 'off',
    // Required for `declare global { namespace Express { … } }` Request augmentation.
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/ban-ts-comment': 'warn',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-console': 'off',
    'prefer-const': 'warn',
  },
};

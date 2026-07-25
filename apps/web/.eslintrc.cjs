module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: ['eslint:recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  settings: { react: { version: 'detect' } },
  rules: {
    'no-unused-vars': 'off',
    'no-undef': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
    // The leading-underscore "intentionally unused" convention has to cover
    // variables and destructured siblings too, not just parameters — otherwise
    // `const [, _dropped] = …` still warns and the convention reads as broken.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
    ],
    // TypeScript owns redeclaration — it correctly allows a type and a value to
    // share a name, which the base rule reports as a false positive.
    'no-redeclare': 'off',
    // Hook correctness. rules-of-hooks is an ERROR because breaking it produces
    // real runtime crashes and corrupted state — not a style opinion. This
    // plugin was missing entirely until LCXOS P1, so every
    // `eslint-disable react-hooks/*` comment in the tree was silently a no-op
    // AND itself an error ("rule not found").
    // exhaustive-deps is a WARN (React's own default): the tree has deliberate
    // omissions, and failing hard there pushes people to blanket-disable it —
    // worse than seeing the warnings.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['dist', 'node_modules'],
};

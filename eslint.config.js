import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Module boundaries from docs/ARCHITECTURE.md are enforced here, and tested in
// scripts/lint-boundaries.test.ts. `core` is the strictest: no Electron, no database, no network,
// no system clock.

const NODE_BUILTINS = 'node:|(?:assert|buffer|child_process|crypto|dns|events|fs|http|http2|https|net|os|path|stream|tls|url|util|worker_threads|zlib)(?:/|$)';

/** Bans relative imports that reach a module folder, whether as `../data`, `../data/db` or `../../data/index`. */
function banModules(names, message) {
  return { regex: `^\\.{1,2}/(?:.*/)?(?:${names.join('|')})(?:/|$)`, message };
}

/** Bans every package import except the listed ones. Relative imports are left to `banModules`. */
function onlyPackages(allowed, message) {
  const allowList = allowed.length > 0 ? `(?!(?:${allowed.join('|')})(?:/|$))` : '';
  return { regex: `^(?!\\.{1,2}(?:/|$))${allowList}`, message };
}

function banPackages(pattern, message) {
  return { regex: `^(?:${pattern})`, message };
}

function restrict(...patterns) {
  return { 'no-restricted-imports': ['error', { patterns }] };
}

const CORE_MODULE_BAN = banModules(
  ['data', 'main', 'ui', 'platforms', 'llm', 'bridge', 'preload'],
  'core is pure: it may import only other core files.',
);
const PLATFORMS_MODULE_BAN = banModules(
  ['data', 'main', 'ui', 'llm', 'bridge', 'preload'],
  'platforms may import only core.',
);

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'artifacts/**',
      'test-results/**',
      'playwright-report/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // core: pure TypeScript. Time and time zone are arguments, never read from the system.
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      ...restrict(
        onlyPackages(['zod', 'ts-fsrs'], 'core is pure: the only packages it may import are zod and ts-fsrs.'),
        CORE_MODULE_BAN,
      ),
      'no-restricted-globals': [
        'error',
        ...[
          'fetch',
          'XMLHttpRequest',
          'WebSocket',
          'EventSource',
          'navigator',
          'window',
          'document',
          'process',
          'localStorage',
          'globalThis',
          'global',
          'self',
          'require',
        ].map((name) => ({ name, message: 'core has no network, DOM, process or global access.' })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'core never reads the system clock. Take the current time as an argument.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'core never reads the system clock. Take the current time as an argument.',
        },
        {
          selector: "CallExpression[callee.object.name='performance'][callee.property.name='now']",
          message: 'core never reads the system clock. Take the current time as an argument.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'core is deterministic. Take a seed or a random source as an argument.',
        },
        {
          selector: "CallExpression[callee.property.name='resolvedOptions']",
          message: 'core never reads the system time zone or locale. Take the time zone as an argument.',
        },
        {
          selector: 'ImportExpression',
          message: 'core does not load code dynamically.',
        },
      ],
    },
  },
  {
    // Tests in core may also import the test runner. Every other core rule still applies to them.
    files: ['src/core/**/*.test.ts'],
    rules: restrict(
      onlyPackages(['zod', 'ts-fsrs', 'vitest'], 'core tests may import only zod, ts-fsrs and vitest.'),
      CORE_MODULE_BAN,
    ),
  },
  {
    files: ['src/platforms/**/*.ts'],
    rules: restrict(
      onlyPackages([], 'platforms imports no packages: it may import only core.'),
      PLATFORMS_MODULE_BAN,
    ),
  },
  {
    files: ['src/platforms/**/*.test.ts'],
    rules: restrict(onlyPackages(['vitest'], 'platforms tests may import only vitest.'), PLATFORMS_MODULE_BAN),
  },
  {
    files: ['src/data/**/*.ts'],
    rules: restrict(
      banPackages('electron(?:/|$)', 'data must not import Electron.'),
      banModules(['main', 'ui', 'llm', 'bridge', 'preload'], 'data may import only core and platforms.'),
    ),
  },
  {
    files: ['src/llm/**/*.ts'],
    rules: restrict(
      banPackages('electron(?:/|$)', 'llm must not import Electron.'),
      banModules(['data', 'main', 'ui', 'bridge', 'preload', 'platforms'], 'llm may import only core.'),
    ),
  },
  {
    files: ['src/bridge/**/*.ts'],
    rules: restrict(
      onlyPackages(['zod'], 'bridge is the shared contract: the only package it may import is zod.'),
      banModules(
        ['data', 'main', 'ui', 'llm', 'platforms', 'preload'],
        'bridge is the shared contract: it may import only core.',
      ),
    ),
  },
  {
    // The use-case layer is Electron-free so it can be unit-tested with a real SQLite database.
    files: ['src/main/services/**/*.ts'],
    rules: restrict(
      banPackages('electron(?:/|$)', 'services must not import Electron.'),
      banModules(['ui', 'preload', 'windows'], 'services must not import the UI, the preload or window code.'),
    ),
  },
  {
    files: ['src/main/**/*.ts'],
    ignores: ['src/main/services/**/*.ts'],
    rules: restrict(banModules(['ui'], 'main must not import the UI. Share types through bridge.')),
  },
  {
    files: ['src/preload/**/*.ts'],
    rules: restrict(
      onlyPackages(['electron'], 'the preload only forwards calls: the only package it may import is electron.'),
      banModules(
        ['core', 'data', 'main', 'ui', 'llm', 'platforms'],
        'the preload may import only bridge/channels.',
      ),
    ),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...restrict(
        banPackages(`electron(?:/|$)|${NODE_BUILTINS}`, 'ui runs in the browser sandbox: no Electron or Node imports.'),
        banModules(
          ['data', 'main', 'llm', 'platforms', 'preload'],
          'ui talks to the app only through the bridge. It may import core, bridge and its own files.',
        ),
      ),
    },
  },
);

import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Module boundaries from docs/ARCHITECTURE.md are enforced here. Each entry lists what a module may
// NOT import. `core` is the strictest: no Electron, no database, no network, no system clock.
const NODE_BUILTINS = ['node:*', 'fs', 'path', 'os', 'child_process', 'http', 'https', 'net', 'crypto'];

function forbid(patterns, message) {
  return {
    'no-restricted-imports': ['error', { patterns: patterns.map((group) => ({ group, message })) }],
  };
}

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
    files: ['src/core/**/*.ts'],
    rules: {
      ...forbid(
        [
          ['electron'],
          NODE_BUILTINS,
          ['**/data/**', '**/main/**', '**/ui/**', '**/platforms/**', '**/llm/**', '**/bridge/**', '**/preload/**'],
        ],
        'core is pure: it may import only other core files, zod and ts-fsrs.',
      ),
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'window', 'document', 'process', 'localStorage'].map((name) => ({
          name,
          message: 'core has no network, DOM or process access.',
        })),
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
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'core is deterministic. Take a seed or a random source as an argument.',
        },
      ],
    },
  },
  {
    files: ['src/platforms/**/*.ts'],
    rules: forbid(
      [['electron'], ['**/data/**', '**/main/**', '**/ui/**', '**/llm/**', '**/bridge/**', '**/preload/**']],
      'platforms may import only core.',
    ),
  },
  {
    files: ['src/data/**/*.ts'],
    rules: forbid(
      [['electron'], ['**/main/**', '**/ui/**', '**/llm/**', '**/bridge/**', '**/preload/**']],
      'data may import only core and platforms.',
    ),
  },
  {
    files: ['src/llm/**/*.ts'],
    rules: forbid(
      [['electron'], ['**/data/**', '**/main/**', '**/ui/**', '**/bridge/**', '**/preload/**']],
      'llm may import only core.',
    ),
  },
  {
    files: ['src/bridge/**/*.ts'],
    rules: forbid(
      [
        ['electron'],
        NODE_BUILTINS,
        ['**/data/**', '**/main/**', '**/ui/**', '**/llm/**', '**/platforms/**', '**/preload/**'],
      ],
      'bridge is the shared contract: it may import only core and zod.',
    ),
  },
  {
    // The use-case layer is Electron-free so it can be unit-tested with a real SQLite database.
    files: ['src/main/services/**/*.ts'],
    rules: forbid([['electron'], ['**/ui/**', '**/preload/**']], 'services must not import Electron or the UI.'),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...forbid(
        [
          ['electron'],
          NODE_BUILTINS,
          ['**/data/**', '**/main/**', '**/llm/**', '**/platforms/**', '**/preload/**'],
        ],
        'ui talks to the app only through the bridge. It may import core, bridge and its own files.',
      ),
    },
  },
);

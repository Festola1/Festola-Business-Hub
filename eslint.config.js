import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import js from '@eslint/js';
import esbuild from 'esbuild';
import * as espree from 'espree';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * TypeScript 7.0 compatible ESLint parser:
 * Uses esbuild (with JSX preserved) to strip TS type annotations, then parses
 * with ESLint's native espree parser so all JS, React Hooks, and import-boundary
 * lint rules run cleanly alongside TypeScript 7's `tsc --noEmit`.
 */
const ts7CompatibleParser = {
  meta: {
    name: 'festola-ts7-esbuild-parser',
    version: '1.0.0',
  },
  parseForESLint(code, options = {}) {
    const filePath = options.filePath || 'file.tsx';
    const loader = filePath.endsWith('.tsx') ? 'tsx' : 'ts';
    const transformed = esbuild.transformSync(code, {
      loader,
      jsx: 'automatic',
      target: 'es2022',
      format: 'esm',
    });

    const ast = espree.parse(transformed.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
      range: true,
      tokens: true,
      comment: true,
      ecmaFeatures: {
        jsx: true,
      },
    });

    return { ast };
  },
};

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  fetch: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  HTMLElement: 'readonly',
  Blob: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  global: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  fetch: 'readonly',
  structuredClone: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      '.aistudio/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  firebaseRulesPlugin.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/db/**'],
    languageOptions: {
      parser: ts7CompatibleParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Enforce strict client/server boundary: browser code must never import server or database modules
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../server/*',
                '../../server/*',
                '@/server/*',
                'server/*',
                '../db/*',
                '../../db/*',
                '@/db/*',
              ],
              message:
                'Browser code in src/ must never import server modules, database connections, or server-only secrets.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Use typed VITE_* accessors in src/config/env.ts instead of process.env.',
        },
      ],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['server/**/*.ts', 'src/db/**/*.ts', 'server.ts', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      parser: ts7CompatibleParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      parser: ts7CompatibleParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
];

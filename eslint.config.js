// ESLint gate for Le Studio.
//
// Scoped deliberately: this file catches the bug classes that `tsc
// --noEmit` cannot (checkJs is off) and that shipped twice — the
// `useEffect`-without-import crash in Memory.jsx and a dangling-identifier
// refactor that passed 623 unit tests and a green build. Rules:
//
//   no-undef                  — dangling/typo'd identifiers (the Memory.jsx crash)
//   react-hooks/rules-of-hooks— conditional/loop hook calls
//   react-hooks/exhaustive-deps — missing effect deps (the async-race bug class:
//                               TodaySession's studyTick replan bug shipped this way)
//
// It is NOT a style linter; formatting stays unopinionated.

import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import parser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      // The JSX-aware parser is what makes no-unused-vars truthful: with the
      // default parser every <Component /> looks "unused" (~700 false
      // positives that would make the gate ignorable).
      parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      // Dead code debt (unused imports/args) is tracked as warnings — a
      // cleanup backlog, not a build blocker. The crash-class rules above
      // are the gate.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'react-hooks/rules-of-hooks': 'error',
      // Stale/missing hook deps caused the TodaySession studyTick bug (Today
      // could stay blank depending on module resolution order). Every site is
      // now either genuinely fixed or carries an explicit refresh-signal
      // `void tick` inside the hook body, so this is enforced as an error.
      'react-hooks/exhaustive-deps': 'error',
      // `try {} catch {}` swallows are an accepted idiom in this codebase
      // (localStorage guards, optional telemetry).
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'error',
    },
  },
  {
    // The test tree was outside the lint scope, which is how a duplicate
    // `protocolVersion` key and two assertions that could not fail survived.
    // Only correctness rules here — not formatting, not the React rules.
    files: ['tests/**/*.{js,mjs}', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Node for the runner itself, browser for the jsdom render tests and the
      // localStorage doubles — both are legitimately used in this tree.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      // A test that cannot fail is worse than no test: it reads as coverage.
      'no-constant-binary-expression': 'error',
      // Two keys with the same name in one literal — the second silently wins,
      // which is how a fixture ends up asserting something it never set.
      'no-dupe-keys': 'error',
      // Known backlog: ~44 bindings that are built or destructured and never
      // read (unused imports in pronunciation-profiles, `const { storage } =
      // await import(...)` where only the module load matters). Surfaced as
      // warnings and deliberately NOT blocking, so `npm run lint:tests` makes
      // the backlog visible without turning this correctness gate into a wall.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];

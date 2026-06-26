// ESLint flat-config (ESLint v9+/v10). Erstatter den gamle .eslintrc.cjs.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', '**/node_modules'],
  },

  js.configs.recommended,

  // Frontend: browser, ESM, JSX
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off',
    },
  },

  // Testfiler (Vitest): tilføj node-globals (fx `global`) oven på browser
  {
    files: ['src/**/*.{test,spec}.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Node ESM: byggekonfiguration, scripts, e2e, functions-tests/-config
  {
    files: [
      '*.{js,cjs}',
      'e2e/**/*.js',
      'scripts/**/*.mjs',
      'functions/**/*.test.js',
      'functions/vitest.config.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Cloud Functions kildekode: CommonJS + Node
  {
    files: ['functions/index.js', 'functions/scoring.js', 'functions/standings.js', 'functions/knockout.js', 'functions/breakdown.js', 'functions/footballData.js', 'functions/resultsSync.js', 'functions/bonusResolve.js', 'functions/invites.js', 'functions/leagueRecap.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];

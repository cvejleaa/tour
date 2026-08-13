// ESLint flat-config (ESLint v9+/v10). Erstatter den gamle .eslintrc.cjs.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', '**/node_modules', '.claude/worktrees'],
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
      'functions-platform/**/*.test.js',
      'functions/vitest.config.js',
      'functions-platform/vitest.config.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Cloud Functions kildekode: CommonJS + Node
  {
    files: ['functions/index.js', 'functions/tourScoring.js', 'functions/pcsMapping.js', 'functions/tourTeams.js', 'functions/tourSync.js', 'functions/invites.js', 'functions/leagueRecap.js', 'functions/stageTip.js', 'functions/startlistSync.js', 'functions/salesPitch.js', 'functions/liveTicker.js', 'functions/liveMap.js', 'functions/riderTags.js', 'functions/riderTagCanon.js', 'functions/stageTimes.js', 'functions/leagueBonus.js', 'functions/tourSummary.js', 'functions/thankYouEmail.js', 'functions-platform/index.js', 'functions-platform/gameScoring.js', 'functions-platform/startGate.js', 'functions-platform/ligaPoint.js', 'functions-platform/pointOpdeling.js', 'functions-platform/superligaScoring.js', 'functions-platform/superligaSync.js', 'functions-platform/syncProviders.js', 'functions-platform/seedFootball.js', 'functions-platform/driftlog.js', 'functions-platform/gameLeagues.js', 'functions-platform/mailer.js', 'functions-platform/reminders.js', 'functions-platform/gameRecap.js', 'functions-platform/inviteTemplate.js', 'functions-platform/playerLeagues.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];

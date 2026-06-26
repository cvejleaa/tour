// ---------------------------------------------------------------------------
// vitest.rules.config.js — Vitest-konfiguration til Firestore-regler tests.
// Kræver Firebase Emulator (firestore):
//   firebase emulators:start --only firestore
// Kør derefter:
//   npm run test:rules
// Eller direkte:
//   vitest run --config vitest.rules.config.js
//
// Scoring/standings-tests kører WITHOUT emulator via:
//   vitest run functions/scoring.test.js functions/standings.test.js
// ---------------------------------------------------------------------------

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Kun inkluder rules-tests (kræver emulator)
    include: [
      'functions/rules.test.js',
      'functions/knockout.integration.test.js',
      'tests/rules.test.js',
    ],
    // Ekskluder scoring/standings (de har egen config)
    exclude: [
      'functions/scoring.test.js',
      'functions/standings.test.js',
    ],
    // Timeout forøges da emulator-kald kan tage tid
    testTimeout: 30000,
    hookTimeout: 30000,
    // Kør tests sekventielt (vigtigt for emulator-tilstand)
    pool:    'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // Miljøvariabel til at angive emulator-host
    env: {
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080',
    },
  },
});

// ---------------------------------------------------------------------------
// vitest.rules.config.js — Vitest-konfiguration til Firestore-regler tests.
// Kræver Firebase Emulator (firestore):
//   firebase emulators:start --only firestore
// Kør derefter:
//   npm run test:rules
// Eller direkte:
//   vitest run --config vitest.rules.config.js
//
// Functions' egne unit-tests kører UDEN emulator via:
//   npm --prefix functions test  /  npm --prefix functions-platform test
// ---------------------------------------------------------------------------

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Kun rules-tests (kræver emulator). Hold listen præcis: en entry der ikke
    // findes, får kørslen til at se grøn ud uden at teste noget.
    include: [
      'functions/rules.test.js',
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

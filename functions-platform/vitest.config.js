// ---------------------------------------------------------------------------
// functions-platform/vitest.config.js — tests for platform-codebasens rene
// scoring-logik. Kører UDEN emulator (ingen Firebase-afhængigheder).
// ---------------------------------------------------------------------------

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'gameScoring.test.js',
      'pointOpdeling.test.js',
      'superligaScoring.test.js',
      'superligaSync.test.js',
      'gameLeagues.test.js',
      'gameRecap.test.js',
      'inviteTemplate.test.js',
      'reminders.test.js',
      'playerLeagues.test.js',
      'startGate.test.js',
    ],
    exclude: ['node_modules/**'],
    testTimeout: 10000,
  },
});

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
      'syncProviders.test.js',
      'seedFootball.test.js',
      'driftlog.test.js',
      'gameLeagues.test.js',
      'gameRecap.test.js',
      'leagueQuestionScoring.test.js',
      'leagueQuestionRecap.test.js',
      'inviteTemplate.test.js',
      'mailMarkdown.test.js',
      'mailer.test.js',
      'broadcastImage.test.js',
      'reminders.test.js',
      'paamindelsesGate.test.js',
      'playerLeagues.test.js',
      'startGate.test.js',
      'ligaPoint.test.js',
    ],
    exclude: ['node_modules/**'],
    testTimeout: 10000,
  },
});

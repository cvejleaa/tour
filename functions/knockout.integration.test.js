// ---------------------------------------------------------------------------
// functions/knockout.integration.test.js
// Ende-til-ende test mod Firestore-emulatoren: seeder den RIGTIGE kampdata,
// markerer gruppekampene som spillet, læser dem tilbage og bygger r32 med den
// rigtige logik — og verificerer at de genererede kamp-id'er faktisk findes
// som dokumenter i databasen.
//
// Al DB-adgang sker i beforeAll (ét withSecurityRulesDisabled-kald), så vi ikke
// rammer "Firestore settings already started" når flere emulator-testfiler
// kører i samme proces.
//
// KRÆVER emulator — kører i samme CI-job som rules-testene.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Timestamp } from 'firebase/firestore';
import knockout from './knockout.js';

const { buildR32FromGroupMatches } = knockout;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const rules = readFileSync(join(rootDir, 'firestore.rules'), 'utf8');
const matchData = JSON.parse(
  readFileSync(join(rootDir, 'data', 'group-stage.json'), 'utf8'),
).matches.filter((m) => m.id);

let testEnv;
let finishedGroupMatches = [];
let existingIds = new Set();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'vm2026-tip-knockout',
    firestore: {
      rules,
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || 'localhost',
      port: parseInt(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8080'),
    },
  });

  // Al DB-adgang samlet i ét context-kald
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Seed alle kampe; gruppekampe markeres som spillet
    for (const m of matchData) {
      const { id, ...rest } = m;
      const isGroup = rest.round === 'group';
      await db.collection('matches').doc(id).set({
        ...rest,
        kickoff: Timestamp.fromDate(new Date(rest.kickoff)),
        status: isGroup ? 'finished' : (rest.status || 'pendingTeams'),
        result: isGroup ? { home: 2, away: 1 } : null,
      });
    }

    // Læs tilbage til brug i alle tests
    const groupSnap = await db.collection('matches')
      .where('round', '==', 'group').where('status', '==', 'finished').get();
    finishedGroupMatches = groupSnap.docs.map((d) => d.data());

    const allSnap = await db.collection('matches').get();
    existingIds = new Set(allSnap.docs.map((d) => d.id));
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('buildKnockout — ende-til-ende mod emulator', () => {
  it('bygger 16 r32-kampe uden manglende grupper ud fra seedet data', () => {
    const { assignments, missingGroups } = buildR32FromGroupMatches(finishedGroupMatches);
    expect(missingGroups).toHaveLength(0);
    expect(assignments).toHaveLength(16);
  });

  it('alle genererede r32-id\'er findes som kamp-dokumenter i databasen', () => {
    const { assignments } = buildR32FromGroupMatches(finishedGroupMatches);
    for (const a of assignments) {
      expect(existingIds.has(a.id)).toBe(true); // ingen kamp peger på et ukendt id
    }
  });

  it('udfylder rank-baserede kampe med rigtige hold', () => {
    const { assignments } = buildR32FromGroupMatches(finishedGroupMatches);
    const m1 = assignments.find((a) => a.id === 'ko_r32_1');
    expect(m1.home).toBeTruthy();
    expect(m1.away).toBeTruthy();
  });
});

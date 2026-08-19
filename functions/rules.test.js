// ---------------------------------------------------------------------------
// functions/rules.test.js — Tests for Firestore sikkerhedsregler.
//
// KRÆVER Firebase Emulator (firestore):
//   firebase emulators:start --only firestore,auth
//
// Kør med:
//   npm run test:rules
// eller:
//   FIRESTORE_EMULATOR_HOST=localhost:8080 vitest run --config ../vitest.rules.config.js
//
// Disse tests verificerer de kritiske sikkerhedsprincipper fra architecture.md.
// ---------------------------------------------------------------------------

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
}                                  from '@firebase/rules-unit-testing';
import { readFileSync }            from 'fs';
import { fileURLToPath }           from 'url';
import { dirname, join }           from 'path';
import {
  setDoc, doc, updateDoc, getDoc, getDocs, deleteDoc, collection, collectionGroup,
  query, where, Timestamp,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const rootDir    = join(__dirname, '..');

// Indlæs Firestore-reglerne.
//
// RULES_FILE peger normalt intetsteds hen. Den findes, så mutationstest kan
// køre mod en KOPI med én betingelse rullet tilbage: skriver man i selve
// firestore.rules, opdager emulatorens fil-vagt ændringen og genindlæser
// reglerne midt i kørslen.
const rules = readFileSync(process.env.RULES_FILE || join(rootDir, 'firestore.rules'), 'utf8');

let testEnv;

// ---------------------------------------------------------------------------
// Setup: initialiser test-environment med emulator
// ---------------------------------------------------------------------------
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'tour-tip-test',
    firestore: {
      rules,
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || 'localhost',
      port: parseInt(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || '8080'),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  // Ryd alle data mellem tests
  if (testEnv) await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// Hjælpefunktioner
// ---------------------------------------------------------------------------

/** Opret en godkendt bruger med given rolle via admin-context */
async function createUser(uid, role = 'player', status = 'approved') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc(uid).set({
      displayName: `Testspiller ${uid}`,
      email:       `${uid}@test.dk`,
      role,
      status,
      totalPoints: 0,
      createdAt:   Timestamp.now(),
    });
  });
}

/** Opret et match via admin-context */
async function createMatch(matchId, kickoffDate) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('matches').doc(matchId).set({
      round:     'group',
      groupName: 'A',
      homeTeam:  'BRA',
      awayTeam:  'ARG',
      kickoff:   Timestamp.fromDate(kickoffDate),
      status:    'scheduled',
      result:    null,
    });
  });
}

/** Opret en etape via admin-context (til stageBets-regeltests) */
async function createStage(stageId, kickoffDate) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('stages').doc(stageId).set({
      season: 2026,
      number: 1,
      kickoff: Timestamp.fromDate(kickoffDate),
      status: 'scheduled',
      result: null,
    });
  });
}

/** Opret et bonusspørgsmål via admin-context */
async function createBonusQuestion(questionId, deadline) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('bonusQuestions').doc(questionId).set({
      type:      'groupWinner',
      label:     'Hvem vinder gruppe A?',
      groupName: 'A',
      deadline:  Timestamp.fromDate(deadline),
      facit:     null,
      options:   ['BRA', 'ARG', 'URU', 'COL'],
    });
  });
}

// ---------------------------------------------------------------------------
// TESTS: users-collection
// ---------------------------------------------------------------------------
describe('users/{uid} — sikkerhedsregler', () => {
  it('godkendt spiller KAN læse en anden spillers profil', async () => {
    await createUser('user1', 'player', 'approved');
    await createUser('user2', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('user1');
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'users', 'user2'))
    );
  });

  it('en spiller KAN IKKE ændre sin egen role', async () => {
    await createUser('user1', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('user1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
        displayName: 'Nyt navn',
        role:        'owner', // forsøger at opgradere sig selv
      })
    );
  });

  it('en spiller KAN IKKE ændre sin egen status', async () => {
    await createUser('user1', 'player', 'pending');

    const ctx = testEnv.authenticatedContext('user1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
        status: 'approved', // forsøger at godkende sig selv
      })
    );
  });

  it('en spiller KAN IKKE ændre sit eget totalPoints (rangliste-snyd)', async () => {
    await createUser('user1', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('user1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
        totalPoints: 99999, // forsøger at pumpe sin egen placering
      })
    );
  });

  it('en spiller KAN IKKE oprette sin profil med point-felter', async () => {
    const ctx = testEnv.authenticatedContext('newUser');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'users', 'newUser'), {
        displayName: 'Snyder', email: 'x@test.dk', role: 'player', status: 'pending',
        totalPoints: 99999,
      })
    );
  });

  it('en ny bruger KAN oprette sin egen profil (signup-form: ingen e-mail/point)', async () => {
    const ctx = testEnv.authenticatedContext('newUser');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'users', 'newUser'), {
        displayName: 'Ny Spiller', role: 'player', status: 'pending',
        createdAt: Timestamp.now(),
      })
    );
  });

  it('en bruger KAN IKKE lægge sin e-mail på den OFFENTLIGE profil', async () => {
    const ctx = testEnv.authenticatedContext('newUser');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'users', 'newUser'), {
        displayName: 'Ny Spiller', role: 'player', status: 'pending',
        email: 'ny@test.dk',
      })
    );
  });

  it('en bruger KAN IKKE tilføje e-mail til sin profil bagefter', async () => {
    await createUser('user1', 'player', 'approved');
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('user1').firestore(), 'users', 'user1'),
        { email: 'mig@test.dk' })
    );
  });

  it('heller ikke ejeren kan lægge en e-mail på en offentlig profil', async () => {
    await createUser('boss', 'owner', 'approved');
    await createUser('user1', 'player', 'approved');
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('boss').firestore(), 'users', 'user1'),
        { email: 'nogen@test.dk' })
    );
  });

  it('en spiller KAN opdatere sit eget displayName', async () => {
    await createUser('user1', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('user1');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
        displayName: 'Nyt fantastisk navn',
      })
    );
  });

  it('en almindelig spiller KAN IKKE godkende en anden bruger', async () => {
    await createUser('player1', 'player', 'approved');
    await createUser('user2', 'player',   'pending');

    const ctx = testEnv.authenticatedContext('player1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user2'), {
        status: 'approved', // spiller har ikke lov
      })
    );
  });

  it('en global admin KAN godkende en anden bruger', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await createUser('user2', 'player',       'pending');

    const ctx = testEnv.authenticatedContext('admin1');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'user2'), {
        status: 'approved',
      })
    );
  });

  it('en global admin KAN IKKE ændre en brugers rolle (kun ejeren udpeger admins)', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await createUser('user2', 'player',       'approved');

    const ctx = testEnv.authenticatedContext('admin1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'users', 'user2'), {
        role: 'globalAdmin', // kun ejeren må udpege admins
      })
    );
  });

  it('owner KAN godkende en bruger', async () => {
    await createUser('owner1', 'owner',  'approved');
    await createUser('user2',  'player', 'pending');

    const ctx = testEnv.authenticatedContext('owner1');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'users', 'user2'), {
        status: 'approved',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: userContacts-collection (privat e-mail)
// ---------------------------------------------------------------------------
describe('userContacts/{uid} — privat e-mail', () => {
  async function seedContact(uid, email) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('userContacts').doc(uid).set({ uid, email: email || `${uid}@test.dk` });
    });
  }

  it('brugeren KAN oprette sin egen kontaktpost', async () => {
    const ctx = testEnv.authenticatedContext('u1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'userContacts', 'u1'), { uid: 'u1', email: 'u1@test.dk' })
    );
  });

  it('brugeren KAN IKKE oprette en ANDENS kontaktpost', async () => {
    const ctx = testEnv.authenticatedContext('u1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'userContacts', 'u2'), { uid: 'u2', email: 'x@test.dk' })
    );
  });

  it('brugeren KAN IKKE forfalske uid-feltet', async () => {
    const ctx = testEnv.authenticatedContext('u1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'userContacts', 'u1'), { uid: 'u2', email: 'x@test.dk' })
    );
  });

  it('brugeren KAN læse sin egen kontaktpost', async () => {
    await seedContact('u1');
    const ctx = testEnv.authenticatedContext('u1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'userContacts', 'u1')));
  });

  it('en anden godkendt spiller KAN IKKE læse ens kontaktpost', async () => {
    await seedContact('u1');
    await createUser('u2', 'player', 'approved');
    const ctx = testEnv.authenticatedContext('u2');
    await assertFails(getDoc(doc(ctx.firestore(), 'userContacts', 'u1')));
  });

  it('en global admin KAN læse kontaktposter', async () => {
    await seedContact('u1');
    await createUser('admin1', 'globalAdmin', 'approved');
    const ctx = testEnv.authenticatedContext('admin1');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'userContacts', 'u1')));
  });

  it('ingen kan slette en kontaktpost fra klienten', async () => {
    await seedContact('u1');
    const ctx = testEnv.authenticatedContext('u1');
    await assertFails(deleteDoc(doc(ctx.firestore(), 'userContacts', 'u1')));
  });
});

// ---------------------------------------------------------------------------
// TESTS: bets-collection
// ---------------------------------------------------------------------------
describe('bets/{betId} — sikkerhedsregler', () => {
  it('spiller KAN oprette et bet FØR kickoff', async () => {
    const uid      = 'betUser1';
    const matchId  = 'test_match_1';
    const futureKickoff = new Date(Date.now() + 60 * 60 * 1000); // 1 time frem

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    const ctx   = testEnv.authenticatedContext(uid);
    const betId = `${uid}_${matchId}`;

    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'bets', betId), {
        uid,
        matchId,
        home:      2,
        away:      1,
        advance:   null,
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE oprette et bet EFTER kickoff', async () => {
    const uid      = 'betUser2';
    const matchId  = 'test_match_2';
    const pastKickoff = new Date(Date.now() - 60 * 60 * 1000); // 1 time tilbage

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, pastKickoff);

    const ctx   = testEnv.authenticatedContext(uid);
    const betId = `${uid}_${matchId}`;

    await assertFails(
      setDoc(doc(ctx.firestore(), 'bets', betId), {
        uid,
        matchId,
        home:      1,
        away:      0,
        advance:   null,
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE skrive points-feltet', async () => {
    const uid      = 'betUser3';
    const matchId  = 'test_match_3';
    const futureKickoff = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    const ctx   = testEnv.authenticatedContext(uid);
    const betId = `${uid}_${matchId}`;

    await assertFails(
      setDoc(doc(ctx.firestore(), 'bets', betId), {
        uid,
        matchId,
        home:      2,
        away:      1,
        advance:   null,
        points:    5, // forsøger at sætte point manuelt
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE ændre points via update', async () => {
    const uid      = 'betUser4';
    const matchId  = 'test_match_4';
    const futureKickoff = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    // Opret bet via admin (uden points)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bets').doc(`${uid}_${matchId}`).set({
        uid,
        matchId,
        home:      1,
        away:      0,
        advance:   null,
        updatedAt: Timestamp.now(),
      });
    });

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'bets', `${uid}_${matchId}`), {
        points: 5, // forsøger at manipulere point
      })
    );
  });

  it('spiller KAN IKKE læse andres bets', async () => {
    const uid1     = 'betUser5';
    const uid2     = 'betUser6';
    const matchId  = 'test_match_5';
    const futureKickoff = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid1, 'player', 'approved');
    await createUser(uid2, 'player', 'approved');
    await createMatch(matchId, futureKickoff);

    // Opret bet for uid1 via admin
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bets').doc(`${uid1}_${matchId}`).set({
        uid: uid1, matchId, home: 2, away: 1,
      });
    });

    // uid2 forsøger at læse uid1's bet
    const ctx = testEnv.authenticatedContext(uid2);
    await assertFails(
      getDoc(doc(ctx.firestore(), 'bets', `${uid1}_${matchId}`))
    );
  });

  it('spiller KAN læse andres bets EFTER kickoff', async () => {
    const uid1    = 'betUser7';
    const uid2    = 'betUser8';
    const matchId = 'test_match_6';
    const pastKickoff = new Date(Date.now() - 60 * 60 * 1000);

    await createUser(uid1, 'player', 'approved');
    await createUser(uid2, 'player', 'approved');
    await createMatch(matchId, pastKickoff);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bets').doc(`${uid1}_${matchId}`).set({
        uid: uid1, matchId, home: 2, away: 1,
      });
    });

    // uid2 (godkendt) kan læse uid1's bet efter kickoff
    const ctx = testEnv.authenticatedContext(uid2);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'bets', `${uid1}_${matchId}`))
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: bonusBets-collection
// ---------------------------------------------------------------------------
describe('bonusBets/{betId} — sikkerhedsregler', () => {
  it('spiller KAN oprette bonusbet FØR deadline', async () => {
    const uid        = 'bonusUser1';
    const questionId = 'groupWinner_A';
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createBonusQuestion(questionId, futureDeadline);

    const ctx = testEnv.authenticatedContext(uid);
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'bonusBets', `${uid}_${questionId}`), {
        uid,
        questionId,
        answer:    'BRA',
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE oprette bonusbet EFTER deadline', async () => {
    const uid        = 'bonusUser2';
    const questionId = 'groupWinner_B';
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createBonusQuestion(questionId, pastDeadline);

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      setDoc(doc(ctx.firestore(), 'bonusBets', `${uid}_${questionId}`), {
        uid,
        questionId,
        answer:    'ARG',
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE skrive points til bonusbet', async () => {
    const uid        = 'bonusUser3';
    const questionId = 'groupWinner_C';
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid, 'player', 'approved');
    await createBonusQuestion(questionId, futureDeadline);

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      setDoc(doc(ctx.firestore(), 'bonusBets', `${uid}_${questionId}`), {
        uid,
        questionId,
        answer:    'BRA',
        points:    10, // forsøger at sætte bonus-point
        updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE læse andres bonusbet FØR deadline', async () => {
    const uid1 = 'bonusReader1';
    const uid2 = 'bonusReader2';
    const questionId = 'groupWinner_open';
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid1, 'player', 'approved');
    await createUser(uid2, 'player', 'approved');
    await createBonusQuestion(questionId, futureDeadline);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bonusBets').doc(`${uid1}_${questionId}`).set({
        uid: uid1, questionId, answer: 'BRA',
      });
    });

    const ctx = testEnv.authenticatedContext(uid2);
    await assertFails(
      getDoc(doc(ctx.firestore(), 'bonusBets', `${uid1}_${questionId}`))
    );
  });

  it('spiller KAN læse andres bonusbet EFTER deadline (låst)', async () => {
    const uid1 = 'bonusReader3';
    const uid2 = 'bonusReader4';
    const questionId = 'groupWinner_locked';
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000);

    await createUser(uid1, 'player', 'approved');
    await createUser(uid2, 'player', 'approved');
    await createBonusQuestion(questionId, pastDeadline);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bonusBets').doc(`${uid1}_${questionId}`).set({
        uid: uid1, questionId, answer: 'BRA',
      });
    });

    const ctx = testEnv.authenticatedContext(uid2);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'bonusBets', `${uid1}_${questionId}`))
    );
  });

  it('admin KAN læse andres bonusbet FØR deadline', async () => {
    const uid1 = 'bonusReader5';
    const adminUid = 'bonusAdmin1';
    const questionId = 'groupWinner_admin';
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);

    await createUser(uid1, 'player', 'approved');
    await createUser(adminUid, 'globalAdmin', 'approved');
    await createBonusQuestion(questionId, futureDeadline);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bonusBets').doc(`${uid1}_${questionId}`).set({
        uid: uid1, questionId, answer: 'BRA',
      });
    });

    const ctx = testEnv.authenticatedContext(adminUid);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'bonusBets', `${uid1}_${questionId}`))
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: stageBets-collection (Tour) — id-binding + points-beskyttelse
// ---------------------------------------------------------------------------
describe('stageBets/{betId} — sikkerhedsregler', () => {
  it('spiller KAN oprette et etape-tip med korrekt id (uid_stageId) FØR start', async () => {
    const uid = 'sbUser1';
    const stageId = '2026-stage-1';
    await createUser(uid, 'player', 'approved');
    await createStage(stageId, new Date(Date.now() + 60 * 60 * 1000));

    const ctx = testEnv.authenticatedContext(uid);
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'stageBets', `${uid}_${stageId}`), {
        uid, stageId, season: 2026, winnerTeam: 'UAE', updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE oprette et dublet-tip med et andet id (dublet-beskyttelse)', async () => {
    const uid = 'sbUser2';
    const stageId = '2026-stage-1';
    await createUser(uid, 'player', 'approved');
    await createStage(stageId, new Date(Date.now() + 60 * 60 * 1000));

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      // Rigtig uid + stageId, men doc-id følger ikke uid_stageId → afvises.
      setDoc(doc(ctx.firestore(), 'stageBets', `${uid}_${stageId}_dup`), {
        uid, stageId, season: 2026, winnerTeam: 'UAE', updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE oprette et etape-tip EFTER start', async () => {
    const uid = 'sbUser3';
    const stageId = '2026-stage-1';
    await createUser(uid, 'player', 'approved');
    await createStage(stageId, new Date(Date.now() - 60 * 60 * 1000));

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      setDoc(doc(ctx.firestore(), 'stageBets', `${uid}_${stageId}`), {
        uid, stageId, season: 2026, winnerTeam: 'UAE', updatedAt: Timestamp.now(),
      })
    );
  });

  it('spiller KAN IKKE skrive points-feltet på et etape-tip', async () => {
    const uid = 'sbUser4';
    const stageId = '2026-stage-1';
    await createUser(uid, 'player', 'approved');
    await createStage(stageId, new Date(Date.now() + 60 * 60 * 1000));

    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      setDoc(doc(ctx.firestore(), 'stageBets', `${uid}_${stageId}`), {
        uid, stageId, season: 2026, winnerTeam: 'UAE', points: 15, updatedAt: Timestamp.now(),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: matches-collection
// ---------------------------------------------------------------------------
describe('matches — sikkerhedsregler', () => {
  it('godkendt spiller KAN læse matches', async () => {
    await createUser('matchReader', 'player', 'approved');
    await createMatch('readable_match', new Date(Date.now() + 3600000));

    const ctx = testEnv.authenticatedContext('matchReader');
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), 'matches', 'readable_match'))
    );
  });

  it('spiller KAN IKKE oprette matches', async () => {
    await createUser('matchCreator', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('matchCreator');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'matches', 'new_match'), {
        round:   'group',
        kickoff: Timestamp.now(),
        status:  'scheduled',
      })
    );
  });

  it('global admin KAN oprette matches', async () => {
    await createUser('adminUser', 'globalAdmin', 'approved');

    const ctx = testEnv.authenticatedContext('adminUser');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'matches', 'admin_created_match'), {
        round:           'group',
        groupName:       'A',
        homeTeam:        'BRA',
        awayTeam:        'ARG',
        kickoff:         Timestamp.fromDate(new Date(Date.now() + 86400000)),
        status:          'scheduled',
        result:          null,
        homePlaceholder: null,
        awayPlaceholder: null,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: liga-admins (adminUids) — kun global ejer tildeler
// ---------------------------------------------------------------------------
describe('leagues — liga-admins (adminUids)', () => {
  async function seedLeague(id, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagues').doc(id).set({
        name: 'Liga', joinCode: 'ABC123', status: 'approved',
        createdAt: Timestamp.now(), adminUids: [], ...data,
      });
    });
  }

  it('global ejer KAN tildele liga-admin', async () => {
    await createUser('owner1', 'owner', 'approved');
    await createUser('m2', 'player', 'approved');
    await seedLeague('lgA', { ownerUid: 'owner1', memberUids: ['owner1', 'm2'] });

    const ctx = testEnv.authenticatedContext('owner1');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgA'), { adminUids: ['m2'] })
    );
  });

  it('global admin (ikke ejer) KAN IKKE ændre adminUids', async () => {
    await createUser('ma', 'globalAdmin', 'approved');
    await createUser('m2', 'player', 'approved');
    await seedLeague('lgB', { ownerUid: 'someone', memberUids: ['someone', 'm2'] });

    const ctx = testEnv.authenticatedContext('ma');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgB'), { adminUids: ['m2'] })
    );
  });

  it('en liga-admin KAN tilføje medlemmer', async () => {
    await createUser('admin2', 'player', 'approved');
    await seedLeague('lgC', { ownerUid: 'owner9', memberUids: ['owner9', 'admin2'], adminUids: ['admin2'] });

    const ctx = testEnv.authenticatedContext('admin2');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgC'), { memberUids: ['owner9', 'admin2', 'newguy'] })
    );
  });

  it('en liga-admin KAN IKKE ændre status', async () => {
    await createUser('admin2', 'player', 'approved');
    await seedLeague('lgD', { ownerUid: 'owner9', memberUids: ['owner9', 'admin2'], adminUids: ['admin2'] });

    const ctx = testEnv.authenticatedContext('admin2');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgD'), { status: 'rejected' })
    );
  });

  it('en liga-admin KAN IKKE ændre format (kun ejer/global admin styrer scoring)', async () => {
    await createUser('admin2', 'player', 'approved');
    await seedLeague('lgF', { ownerUid: 'owner9', memberUids: ['owner9', 'admin2'], adminUids: ['admin2'], format: 'full' });

    const ctx = testEnv.authenticatedContext('admin2');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgF'), { format: 'bonusOnly' })
    );
  });

  it('et almindeligt medlem KAN IKKE tilføje andre medlemmer', async () => {
    await createUser('plain', 'player', 'approved');
    await seedLeague('lgE', { ownerUid: 'owner9', memberUids: ['owner9', 'plain'], adminUids: [] });

    const ctx = testEnv.authenticatedContext('plain');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgE'), { memberUids: ['owner9', 'plain', 'newguy'] })
    );
  });

  it('en liga-admin KAN IKKE ændre scoring (kun ejer/global admin)', async () => {
    await createUser('admin2', 'player', 'approved');
    await seedLeague('lgG', { ownerUid: 'owner9', memberUids: ['owner9', 'admin2'], adminUids: ['admin2'] });

    const ctx = testEnv.authenticatedContext('admin2');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgG'), { scoring: { group: true, knockout: false, bonus: true, leagueBonus: true, doubleKnockout: false } })
    );
  });

  it('liga-ejeren KAN ændre scoring', async () => {
    await createUser('owner9', 'player', 'approved');
    await seedLeague('lgH', { ownerUid: 'owner9', memberUids: ['owner9'], adminUids: [] });

    const ctx = testEnv.authenticatedContext('owner9');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgH'), { scoring: { group: true, knockout: false, bonus: true, leagueBonus: true, doubleKnockout: false } })
    );
  });

  it('en ikke-medlem KAN IKKE skrive sig ind i en liga (tilmelding sker server-side)', async () => {
    await createUser('joiner', 'player', 'approved');
    await seedLeague('lgJoin', { ownerUid: 'owner9', memberUids: ['owner9', 'other'] });

    const ctx = testEnv.authenticatedContext('joiner');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgJoin'), { memberUids: ['owner9', 'other', 'joiner'] })
    );
  });

  it('en ikke-medlem KAN IKKE læse en fremmed liga (join-kode + medlemsliste)', async () => {
    await createUser('outsider', 'player', 'approved');
    await seedLeague('lgSecret', { ownerUid: 'owner9', memberUids: ['owner9', 'other'] });

    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('outsider').firestore(), 'leagues', 'lgSecret'))
    );
  });

  it('et medlem KAN læse sin egen liga, og admin kan læse alle', async () => {
    await createUser('m9', 'player', 'approved');
    await createUser('adm9', 'globalAdmin', 'approved');
    await seedLeague('lgMine', { ownerUid: 'owner9', memberUids: ['owner9', 'm9'] });

    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('m9').firestore(), 'leagues', 'lgMine')));
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('adm9').firestore(), 'leagues', 'lgMine')));
  });

  it('et medlem KAN forlade ligaen (fjerner KUN sig selv)', async () => {
    await createUser('leaver', 'player', 'approved');
    await seedLeague('lgLeave', { ownerUid: 'owner9', memberUids: ['owner9', 'leaver', 'other'] });

    await assertSucceeds(
      updateDoc(doc(testEnv.authenticatedContext('leaver').firestore(), 'leagues', 'lgLeave'),
        { memberUids: ['owner9', 'other'] })
    );
  });

  it('et medlem KAN IKKE smide andre ud, mens det forlader ligaen', async () => {
    await createUser('attacker', 'player', 'approved');
    await seedLeague('lgWipe', { ownerUid: 'owner9', memberUids: ['owner9', 'attacker', 'other'] });

    const ctx = testEnv.authenticatedContext('attacker');
    // Fjerner sig selv OG 'other' i samme skriv → skal fejle.
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgWipe'), { memberUids: ['owner9'] })
    );
    // Sætter listen til kun sig selv (sletter alle andre) → skal fejle.
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagues', 'lgWipe'), { memberUids: ['attacker'] })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: leagueBonus + leagueBonusAnswers (individuelle liga-bonusspørgsmål)
// ---------------------------------------------------------------------------
describe('leagueBonus / leagueBonusAnswers — sikkerhedsregler', () => {
  async function seedLeague2(id, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagues').doc(id).set({
        name: 'Liga', joinCode: 'AAA111', status: 'approved', createdAt: Timestamp.now(),
        adminUids: [], ...data,
      });
    });
  }
  async function seedQuestion(qid, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagueBonus').doc(qid).set({
        type: 'text', label: 'Spørgsmål', facit: null, createdAt: Timestamp.now(), ...data,
      });
    });
  }
  const future = () => Timestamp.fromDate(new Date(Date.now() + 3600000));
  const past = () => Timestamp.fromDate(new Date(Date.now() - 3600000));

  it('en liga-manager KAN oprette et bonusspørgsmål', async () => {
    await createUser('mgr', 'player', 'approved');
    await seedLeague2('lb1', { ownerUid: 'mgr', memberUids: ['mgr'] });
    const ctx = testEnv.authenticatedContext('mgr');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'leagueBonus', 'q1'), {
      leagueId: 'lb1', createdBy: 'mgr', type: 'text', label: 'Hvem?', facit: null,
      deadline: future(), createdAt: Timestamp.now(),
    }));
  });

  it('et almindeligt medlem KAN IKKE oprette et bonusspørgsmål', async () => {
    await createUser('mgr', 'player', 'approved');
    await createUser('m', 'player', 'approved');
    await seedLeague2('lb2', { ownerUid: 'mgr', memberUids: ['mgr', 'm'] });
    const ctx = testEnv.authenticatedContext('m');
    await assertFails(setDoc(doc(ctx.firestore(), 'leagueBonus', 'q2'), {
      leagueId: 'lb2', createdBy: 'm', type: 'text', label: 'Snyd', facit: null,
      deadline: future(), createdAt: Timestamp.now(),
    }));
  });

  it('et medlem KAN gemme eget svar FØR deadline', async () => {
    await createUser('m', 'player', 'approved');
    await seedLeague2('lb3', { ownerUid: 'x', memberUids: ['x', 'm'] });
    await seedQuestion('q3', { leagueId: 'lb3', createdBy: 'x', deadline: future() });
    const ctx = testEnv.authenticatedContext('m');
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'leagueBonusAnswers', 'q3_m'), {
      questionId: 'q3', leagueId: 'lb3', uid: 'm', answer: 'Messi',
    }));
  });

  it('et medlem KAN IKKE gemme svar EFTER deadline', async () => {
    await createUser('m', 'player', 'approved');
    await seedLeague2('lb4', { ownerUid: 'x', memberUids: ['x', 'm'] });
    await seedQuestion('q4', { leagueId: 'lb4', createdBy: 'x', deadline: past() });
    const ctx = testEnv.authenticatedContext('m');
    await assertFails(setDoc(doc(ctx.firestore(), 'leagueBonusAnswers', 'q4_m'), {
      questionId: 'q4', leagueId: 'lb4', uid: 'm', answer: 'Messi',
    }));
  });

  it('en liga-manager KAN læse et medlems svar FØR deadline', async () => {
    await createUser('mgr', 'player', 'approved');
    await createUser('m', 'player', 'approved');
    await seedLeague2('lb5', { ownerUid: 'mgr', memberUids: ['mgr', 'm'] });
    await seedQuestion('q5', { leagueId: 'lb5', createdBy: 'mgr', deadline: future() });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagueBonusAnswers').doc('q5_m').set({
        questionId: 'q5', leagueId: 'lb5', uid: 'm', answer: 'Messi',
      });
    });
    const ctx = testEnv.authenticatedContext('mgr');
    await assertSucceeds(getDoc(doc(ctx.firestore(), 'leagueBonusAnswers', 'q5_m')));
  });

  it('et almindeligt medlem KAN IKKE læse andres svar FØR deadline', async () => {
    await createUser('m', 'player', 'approved');
    await createUser('m2', 'player', 'approved');
    await seedLeague2('lb6', { ownerUid: 'x', memberUids: ['x', 'm', 'm2'] });
    await seedQuestion('q6', { leagueId: 'lb6', createdBy: 'x', deadline: future() });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagueBonusAnswers').doc('q6_m').set({
        questionId: 'q6', leagueId: 'lb6', uid: 'm', answer: 'Messi',
      });
    });
    const ctx = testEnv.authenticatedContext('m2');
    await assertFails(getDoc(doc(ctx.firestore(), 'leagueBonusAnswers', 'q6_m')));
  });
});

// ---------------------------------------------------------------------------
// Hjælpefunktion: opret en liga via admin-context
// ---------------------------------------------------------------------------
async function createLeague(leagueId, ownerUid, memberUids, status = 'approved') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('leagues').doc(leagueId).set({
      name:       `Liga ${leagueId}`,
      ownerUid,
      joinCode:   'ABC123',
      memberUids,
      status,
      createdAt:  Timestamp.now(),
    });
  });
}

// ---------------------------------------------------------------------------
// TESTS: leagueComments-collection (liga-væg)
// ---------------------------------------------------------------------------
describe('leagueComments/{id} — sikkerhedsregler', () => {
  it('et medlem KAN skrive på sin ligas væg', async () => {
    await createUser('m1', 'player', 'approved');
    await createLeague('lg1', 'm1', ['m1']);

    const ctx = testEnv.authenticatedContext('m1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'leagueComments', 'c1'), {
        leagueId: 'lg1', uid: 'm1', displayName: 'M1', text: 'Hej!', createdAt: Timestamp.now(),
      })
    );
  });

  it('et IKKE-medlem KAN IKKE skrive på væggen', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('outsider', 'player', 'approved');
    await createLeague('lg2', 'm1', ['m1']);

    const ctx = testEnv.authenticatedContext('outsider');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'leagueComments', 'c2'), {
        leagueId: 'lg2', uid: 'outsider', displayName: 'O', text: 'snyd', createdAt: Timestamp.now(),
      })
    );
  });

  it('man KAN IKKE skrive en kommentar i en andens navn', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('m2', 'player', 'approved');
    await createLeague('lg3', 'm1', ['m1', 'm2']);

    const ctx = testEnv.authenticatedContext('m2');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'leagueComments', 'c3'), {
        leagueId: 'lg3', uid: 'm1', displayName: 'M1', text: 'falsk', createdAt: Timestamp.now(),
      })
    );
  });

  it('et medlem KAN læse væggen, en udenforstående KAN IKKE', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('m2', 'player', 'approved');
    await createUser('outsider', 'player', 'approved');
    await createLeague('lg4', 'm1', ['m1', 'm2']);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagueComments').doc('c4').set({
        leagueId: 'lg4', uid: 'm1', displayName: 'M1', text: 'hemmeligt', createdAt: Timestamp.now(),
      });
    });

    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('m2').firestore(), 'leagueComments', 'c4')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('outsider').firestore(), 'leagueComments', 'c4')));
  });

  it('forfatteren KAN slette egen kommentar; en anden kan ikke', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('m2', 'player', 'approved');
    await createLeague('lg5', 'm1', ['m1', 'm2']);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagueComments').doc('c5').set({
        leagueId: 'lg5', uid: 'm2', displayName: 'M2', text: 'slet mig', createdAt: Timestamp.now(),
      });
    });

    // m1 er ikke forfatter, men er ligaens ejer → må slette
    await assertSucceeds(deleteDoc(doc(testEnv.authenticatedContext('m1').firestore(), 'leagueComments', 'c5')));
  });
});

// ---------------------------------------------------------------------------
// TESTS: messages-collection (private 1:1-beskeder)
// ---------------------------------------------------------------------------
describe('messages/{id} — sikkerhedsregler', () => {
  it('en bruger KAN sende en besked til en liga-fælle', async () => {
    await createUser('a', 'player', 'approved');
    await createUser('b', 'player', 'approved');
    await createLeague('lgm', 'a', ['a', 'b']);

    const ctx = testEnv.authenticatedContext('a');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'messages', 'msg1'), {
        participants: ['a', 'b'], conversationId: 'a__b', from: 'a', to: 'b',
        leagueId: 'lgm', text: 'Hej B', createdAt: Timestamp.now(),
      })
    );
  });

  it('man KAN IKKE sende til en man ikke deler liga med', async () => {
    await createUser('a', 'player', 'approved');
    await createUser('b', 'player', 'approved');
    await createLeague('lgsolo', 'a', ['a']); // kun a er medlem

    const ctx = testEnv.authenticatedContext('a');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'messages', 'msgx'), {
        participants: ['a', 'b'], conversationId: 'a__b', from: 'a', to: 'b',
        leagueId: 'lgsolo', text: 'Hej', createdAt: Timestamp.now(),
      })
    );
  });

  it('man KAN IKKE sende en besked i en andens navn', async () => {
    await createUser('a', 'player', 'approved');
    await createUser('b', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('a');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'messages', 'msg2'), {
        participants: ['a', 'b'], conversationId: 'a__b', from: 'b', to: 'a',
        text: 'falsk', createdAt: Timestamp.now(),
      })
    );
  });

  it('en udenforstående KAN IKKE læse en samtale', async () => {
    await createUser('a', 'player', 'approved');
    await createUser('b', 'player', 'approved');
    await createUser('c', 'player', 'approved');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('messages').doc('msg3').set({
        participants: ['a', 'b'], conversationId: 'a__b', from: 'a', to: 'b',
        text: 'privat', createdAt: Timestamp.now(),
      });
    });

    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('b').firestore(), 'messages', 'msg3')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('c').firestore(), 'messages', 'msg3')));
  });

  it('afsenderen KAN slette egen besked; modtageren KAN IKKE', async () => {
    await createUser('a', 'player', 'approved');
    await createUser('b', 'player', 'approved');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('messages').doc('msg4').set({
        participants: ['a', 'b'], conversationId: 'a__b', from: 'a', to: 'b',
        text: 'slet', createdAt: Timestamp.now(),
      });
    });

    await assertFails(deleteDoc(doc(testEnv.authenticatedContext('b').firestore(), 'messages', 'msg4')));
    await assertSucceeds(deleteDoc(doc(testEnv.authenticatedContext('a').firestore(), 'messages', 'msg4')));
  });
});

// ---------------------------------------------------------------------------
// TESTS: tipParticipation-collection (skrivebeskyttet for klienter)
// ---------------------------------------------------------------------------
describe('tipParticipation/{matchId} — sikkerhedsregler', () => {
  it('godkendt bruger KAN læse deltagelse', async () => {
    await createUser('p1', 'player', 'approved');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('tipParticipation').doc('match_1').set({
        matchId: 'match_1', uids: ['p1', 'p2'],
      });
    });

    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'tipParticipation', 'match_1')));
  });

  it('en klient KAN IKKE skrive deltagelse (kun server)', async () => {
    await createUser('p1', 'player', 'approved');

    const ctx = testEnv.authenticatedContext('p1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'tipParticipation', 'match_2'), {
        matchId: 'match_2', uids: ['p1'],
      })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: reaktioner på liga-kommentarer
// ---------------------------------------------------------------------------
describe('leagueComments — reaktioner', () => {
  async function seedComment(authorUid) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagueComments').doc('rc1').set({
        leagueId: 'rlg', uid: authorUid, displayName: 'X', text: 'hej', createdAt: Timestamp.now(),
      });
    });
  }

  it('et medlem KAN reagere (kun reactions-feltet)', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('m2', 'player', 'approved');
    await createLeague('rlg', 'm1', ['m1', 'm2']);
    await seedComment('m1');

    const ctx = testEnv.authenticatedContext('m2');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'leagueComments', 'rc1'), { reactions: { '👍': ['m2'] } })
    );
  });

  it('et medlem KAN IKKE ændre teksten via reaktions-reglen', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('m2', 'player', 'approved');
    await createLeague('rlg', 'm1', ['m1', 'm2']);
    await seedComment('m1');

    const ctx = testEnv.authenticatedContext('m2');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagueComments', 'rc1'), { reactions: { '👍': ['m2'] }, text: 'hacket' })
    );
  });

  it('en udenforstående KAN IKKE reagere', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('outsider', 'player', 'approved');
    await createLeague('rlg', 'm1', ['m1']);
    await seedComment('m1');

    const ctx = testEnv.authenticatedContext('outsider');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'leagueComments', 'rc1'), { reactions: { '👍': ['outsider'] } })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: reaktioner på tips (bets) efter kickoff
// ---------------------------------------------------------------------------
describe('bets — reaktioner efter kickoff', () => {
  async function seedBet(uid, matchId) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('bets').doc(`${uid}_${matchId}`).set({
        uid, matchId, home: 1, away: 0,
      });
    });
  }

  it('en anden bruger KAN reagere EFTER kickoff', async () => {
    await createUser('u1', 'player', 'approved');
    await createUser('u2', 'player', 'approved');
    await createMatch('rb_past', new Date(Date.now() - 3600000));
    await seedBet('u1', 'rb_past');

    const ctx = testEnv.authenticatedContext('u2');
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), 'bets', 'u1_rb_past'), { reactions: { '🔥': ['u2'] } })
    );
  });

  it('en anden bruger KAN IKKE reagere FØR kickoff', async () => {
    await createUser('u1', 'player', 'approved');
    await createUser('u2', 'player', 'approved');
    await createMatch('rb_future', new Date(Date.now() + 3600000));
    await seedBet('u1', 'rb_future');

    const ctx = testEnv.authenticatedContext('u2');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'bets', 'u1_rb_future'), { reactions: { '🔥': ['u2'] } })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: leagueActivity-collection
// ---------------------------------------------------------------------------
describe('leagueActivity/{id} — sikkerhedsregler', () => {
  it('et medlem KAN logge aktivitet som sig selv', async () => {
    await createUser('m1', 'player', 'approved');
    await createLeague('alg', 'm1', ['m1']);

    const ctx = testEnv.authenticatedContext('m1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'leagueActivity', 'a1'), {
        leagueId: 'alg', type: 'comment', text: 'skrev noget', actorUid: 'm1', actorName: 'M1', createdAt: Timestamp.now(),
      })
    );
  });

  it('en udenforstående KAN IKKE logge aktivitet', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('outsider', 'player', 'approved');
    await createLeague('alg', 'm1', ['m1']);

    const ctx = testEnv.authenticatedContext('outsider');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'leagueActivity', 'a2'), {
        leagueId: 'alg', type: 'comment', text: 'snyd', actorUid: 'outsider', actorName: 'O', createdAt: Timestamp.now(),
      })
    );
  });

  it('et medlem KAN læse feedet, en udenforstående KAN IKKE', async () => {
    await createUser('m1', 'player', 'approved');
    await createUser('outsider', 'player', 'approved');
    await createLeague('alg', 'm1', ['m1']);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('leagueActivity').doc('a3').set({
        leagueId: 'alg', type: 'join', text: 'kom med', actorUid: 'm1', actorName: 'M1', createdAt: Timestamp.now(),
      });
    });

    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('m1').firestore(), 'leagueActivity', 'a3')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('outsider').firestore(), 'leagueActivity', 'a3')));
  });
});

// ---------------------------------------------------------------------------
// TESTS: emailLog (kun admin-læsning, ingen klient-skrivning)
// ---------------------------------------------------------------------------
describe('emailLog — sikkerhedsregler', () => {
  async function seedLog() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('emailLog').doc('e1').set({
        to: 'a@b.dk', subject: 'Test', type: 'reminder', status: 'sent', createdAt: Timestamp.now(),
      });
    });
  }

  it('en global admin KAN læse mail-loggen', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await seedLog();
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('admin1').firestore(), 'emailLog', 'e1')));
  });

  it('en almindelig spiller KAN IKKE læse mail-loggen', async () => {
    await createUser('p1', 'player', 'approved');
    await seedLog();
    await assertFails(getDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'emailLog', 'e1')));
  });

  it('selv en admin KAN IKKE skrive i mail-loggen fra klienten', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    const ctx = testEnv.authenticatedContext('admin1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'emailLog', 'e2'), {
        to: 'x@y.dk', subject: 'Snyd', type: 'reminder', status: 'sent', createdAt: Timestamp.now(),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: driftlog + driftAlarmer (emailLog-mønstret: kun admin-læsning, ingen
// klient-skrivning — kvittering går gennem callablen, aldrig en skrive-regel)
// ---------------------------------------------------------------------------
describe('driftlog + driftAlarmer — sikkerhedsregler', () => {
  async function seedDrift() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('driftlog').doc('sweep-sl').set({
        type: 'sweep', gameId: 'sl', niveau: 'ok', besked: 'x', koertAt: 1,
      });
      await ctx.firestore().collection('driftAlarmer').doc('a1').set({
        type: 'strandet', gameId: 'sl', kampId: 'r1-a-b', besked: 'x', loestAt: null,
      });
    });
  }

  it('en global admin KAN læse status og alarmer', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await seedDrift();
    const fs = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(getDoc(doc(fs, 'driftlog', 'sweep-sl')));
    await assertSucceeds(getDoc(doc(fs, 'driftAlarmer', 'a1')));
  });

  it('en almindelig spiller KAN IKKE læse nogen af delene', async () => {
    await createUser('p1', 'player', 'approved');
    await seedDrift();
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertFails(getDoc(doc(fs, 'driftlog', 'sweep-sl')));
    await assertFails(getDoc(doc(fs, 'driftAlarmer', 'a1')));
  });

  it('selv en admin KAN IKKE skrive — heller ikke kvittere — fra klienten', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await seedDrift();
    const fs = testEnv.authenticatedContext('admin1').firestore();
    await assertFails(setDoc(doc(fs, 'driftlog', 'sweep-sl'), { niveau: 'ok' }, { merge: true }));
    // Kvittering udenom callablen ville omgå "serveren er eneste autoritet".
    await assertFails(setDoc(doc(fs, 'driftAlarmer', 'a1'), { kvitteretAt: 1 }, { merge: true }));
  });

  // LIST-queries — dét, klienten faktisk gør (useDriftStatus lytter på hele
  // samlingen + en where-query). Skærpes reglen senere med et resource.data-
  // led, bliver getDoc-testene ved med at være grønne, mens fladen står tom —
  // "regler er ikke filtre"-fælden. Derfor testes queryen selv.
  it('list-queries: admin kan, spiller kan ikke — inkl. den præcise loestAt-query', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await createUser('p1', 'player', 'approved');
    await seedDrift();
    const adminFs = testEnv.authenticatedContext('admin1').firestore();
    const spillerFs = testEnv.authenticatedContext('p1').firestore();
    await assertSucceeds(getDocs(collection(adminFs, 'driftlog')));
    await assertSucceeds(getDocs(query(collection(adminFs, 'driftAlarmer'), where('loestAt', '==', null))));
    await assertFails(getDocs(collection(spillerFs, 'driftlog')));
    await assertFails(getDocs(query(collection(spillerFs, 'driftAlarmer'), where('loestAt', '==', null))));
  });
});

// ---------------------------------------------------------------------------
// TESTS: games/{gameId} + games/{gameId}/players/{uid} (samlet platform)
// ---------------------------------------------------------------------------

/** Opret et spil via admin-context */
async function createGame(gameId, extra = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('games').doc(gameId).set({
      name: 'Testspil', type: 'football', status: 'open', joinable: true,
      season: '2026', order: 1, createdAt: Timestamp.now(), ...extra,
    });
  });
}

/** Opret et players-medlemskab via admin-context (fx med point) */
async function seedMembership(gameId, uid, extra = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('games').doc(gameId)
      .collection('players').doc(uid)
      .set({ uid, joinedAt: Timestamp.now(), ...extra });
  });
}

describe('games/{gameId} — sikkerhedsregler', () => {
  it('godkendt spiller KAN læse spiloversigten', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026')));
  });

  it('en spiller KAN IKKE oprette et spil', async () => {
    await createUser('p1', 'player', 'approved');
    const ctx = testEnv.authenticatedContext('p1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'games', 'nyt'), {
        name: 'Snyd', type: 'football', status: 'open', joinable: true,
      })
    );
  });

  it('global admin KAN oprette et spil', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    const ctx = testEnv.authenticatedContext('admin1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'games', 'superliga2627'), {
        name: 'Superligaen 2026/27', type: 'football', status: 'open', joinable: true,
        season: '2026-27', order: 3, createdAt: Timestamp.now(),
      })
    );
  });

  it('ingen KAN slette et spil fra klienten', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await createGame('vm2026');
    await assertFails(deleteDoc(doc(testEnv.authenticatedContext('admin1').firestore(), 'games', 'vm2026')));
  });

  // Status afgør, om spillet står som afsluttet, om det kan tilmeldes, og om
  // der sendes påmindelser. Admin-fanen skriver feltet direkte fra klienten,
  // så det er reglen — ikke knappen — der skal holde spillerne ude.
  it('en spiller KAN IKKE ændre et spils status', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('tour2026', { status: 'live' });
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'tour2026'), {
        status: 'finished',
      })
    );
  });

  it('global admin KAN sætte et spil til afsluttet', async () => {
    await createUser('admin1', 'globalAdmin', 'approved');
    await createGame('tour2026', { status: 'live' });
    await assertSucceeds(
      setDoc(
        doc(testEnv.authenticatedContext('admin1').firestore(), 'games', 'tour2026'),
        { status: 'finished' },
        { merge: true },
      )
    );
  });

  it('en spiller KAN IKKE åbne et afsluttet spil igen', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026', { status: 'finished' });
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026'), {
        status: 'open', joinable: true,
      })
    );
  });

  // -------------------------------------------------------------------------
  // teamStyles — admins hold-overrides (farve + visningsnavn pr. holdnavn).
  //
  // Feltet læses af ENHVER godkendt bruger, og klienten abonnerer på hele
  // games-kollektionen: et opblæst spil-dokument skubbes derfor til samtlige
  // brugere ved hvert snapshot. Admin-fladens `maxLength={40}` er
  // browservalidering og kan omgås — reglen er den eneste rigtige vagt.
  // -------------------------------------------------------------------------
  describe('teamStyles', () => {
    const somAdmin = async () => {
      await createUser('admin1', 'globalAdmin', 'approved');
      await createGame('sl2627');
      return doc(testEnv.authenticatedContext('admin1').firestore(), 'games', 'sl2627');
    };

    // KONTROLTESTEN. Uden den ville alle assertFails nedenfor også bestå, hvis
    // reglen afviste ALT — og så beviste de ingenting.
    it('global admin KAN gemme et almindeligt teamStyles', async () => {
      const ref = await somAdmin();
      await assertSucceeds(updateDoc(ref, {
        teamStyles: {
          'FC Nordsjælland': { visningsnavn: 'Nordsjælland', color: '#B80112' },
          'Brøndby IF': { color: '#003DA5' },
        },
      }));
    });

    it('global admin KAN gemme et tomt teamStyles — det er sådan man nulstiller', async () => {
      const ref = await somAdmin();
      await assertSucceeds(updateDoc(ref, { teamStyles: {} }));
    });

    // Skrivninger UDEN feltet må ikke rammes af den nye vagt. Uden den her
    // kunne betingelsen være vendt om og spærre for alt andet på dokumentet.
    it('en skrivning uden teamStyles er upåvirket', async () => {
      const ref = await somAdmin();
      await assertSucceeds(updateDoc(ref, { status: 'live' }));
    });

    it('teamStyles KAN IKKE være en streng i stedet for et map', async () => {
      const ref = await somAdmin();
      await assertFails(updateDoc(ref, { teamStyles: 'hejsa' }));
    });

    it('teamStyles KAN IKKE være en liste', async () => {
      const ref = await somAdmin();
      await assertFails(updateDoc(ref, { teamStyles: [{ visningsnavn: 'X' }] }));
    });

    // Grænsen er 64. To tests om den, så en mutation af selve TALLET bliver
    // rød — ikke kun en mutation, der fjerner tjekket.
    it('teamStyles KAN have 64 hold', async () => {
      const ref = await somAdmin();
      const stort = {};
      for (let i = 0; i < 64; i += 1) stort[`hold${i}`] = { color: '#123456' };
      await assertSucceeds(updateDoc(ref, { teamStyles: stort }));
    });

    it('teamStyles KAN IKKE have 65 hold', async () => {
      const ref = await somAdmin();
      const stort = {};
      for (let i = 0; i < 65; i += 1) stort[`hold${i}`] = { color: '#123456' };
      await assertFails(updateDoc(ref, { teamStyles: stort }));
    });

    // 3 000 ukendte nøgler var det, emulatoren accepterede før vagten — det er
    // vejen til at skubbe et megabyte-dokument ud til alle brugere.
    it('teamStyles KAN IKKE fyldes med tusindvis af ukendte holdnavne', async () => {
      const ref = await somAdmin();
      const stort = {};
      for (let i = 0; i < 3000; i += 1) stort[`spøgelse${i}`] = { color: '#123456' };
      await assertFails(updateDoc(ref, { teamStyles: stort }));
    });

    // Og en spiller kommer stadig ingen vegne — vagten er et TILLÆG til
    // admin-kravet, ikke en erstatning for det.
    it('en spiller KAN IKKE skrive teamStyles, heller ikke et gyldigt et', async () => {
      await createUser('p1', 'player', 'approved');
      await createGame('sl2627');
      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'sl2627'),
        { teamStyles: { 'Brøndby IF': { visningsnavn: 'Brøndby' } } },
      ));
    });
  });
});

describe('games/{gameId}/players/{uid} — deltagelse', () => {
  it('godkendt bruger KAN tilmelde sig (oprette sit eget medlemskab)', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    const ctx = testEnv.authenticatedContext('p1');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'games', 'vm2026', 'players', 'p1'), {
        uid: 'p1', joinedAt: Timestamp.now(),
      })
    );
  });

  it('en IKKE-godkendt (pending) bruger KAN IKKE tilmelde sig', async () => {
    await createUser('pend', 'player', 'pending');
    await createGame('vm2026');
    const ctx = testEnv.authenticatedContext('pend');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'games', 'vm2026', 'players', 'pend'), {
        uid: 'pend', joinedAt: Timestamp.now(),
      })
    );
  });

  it('man KAN IKKE tilmelde en ANDEN bruger', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    const ctx = testEnv.authenticatedContext('p1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'games', 'vm2026', 'players', 'p2'), {
        uid: 'p2', joinedAt: Timestamp.now(),
      })
    );
  });

  it('man KAN IKKE seede sine egne point ved tilmelding', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    const ctx = testEnv.authenticatedContext('p1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'games', 'vm2026', 'players', 'p1'), {
        uid: 'p1', joinedAt: Timestamp.now(), totalPoints: 999,
      })
    );
  });

  it('man KAN IKKE opskrive sine point på et eksisterende medlemskab', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { totalPoints: 5 });
    const ctx = testEnv.authenticatedContext('p1');
    await assertFails(
      updateDoc(doc(ctx.firestore(), 'games', 'vm2026', 'players', 'p1'), { totalPoints: 999 })
    );
  });

  it('godkendt spiller KAN læse en LIGAKAMMERATS medlemskab (til stilling)', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedMembership('vm2026', 'p2', { totalPoints: 12, leagueIds: ['L1'] });
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026', 'players', 'p2'))
    );
  });

  // --- players/{uid}/detalje/{docId} — spillerens rækker -------------------
  // Underdokumentet har INGEN kickoff-vagt, fordi serveren kun skriver kampe,
  // der er afgjort og begyndt. Adgangen er ren liga-afgrænsning, slået op på
  // players-dokumentet i stedet for en kopi af leagueIds.

  async function seedDetalje(gameId, uid, kampe = { m1: { pick: '1', points: 2.5 } }) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('games').doc(gameId)
        .collection('players').doc(uid)
        .collection('detalje').doc('opdeling')
        .set({ uid, kampe });
    });
  }

  it('man KAN læse sin EGEN detalje', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedDetalje('vm2026', 'p1');
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p1', 'detalje', 'opdeling'))
    );
  });

  // Liga-kammerater kan læse — spillerdetaljen findes nu, og adgangen er
  // nøjagtig den samme kreds, som stillingen i forvejen viser.
  it('man KAN læse en LIGAKAMMERATS detalje', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedMembership('vm2026', 'p2', { leagueIds: ['L1'] });
    await seedDetalje('vm2026', 'p2');
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p2', 'detalje', 'opdeling'))
    );
  });

  it('man KAN IKKE læse detaljen for en man IKKE deler liga med', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedMembership('vm2026', 'p2', { leagueIds: ['L2'] });
    await seedDetalje('vm2026', 'p2');
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p2', 'detalje', 'opdeling'))
    );
  });

  // myLeagueIds() rammer sin exists()-gren, når læseren slet ikke deltager i
  // spillet. Opfører sig korrekt i dag, men intet vogtede det.
  it('man KAN IKKE læse en andens detalje uden selv at deltage i spillet', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p2', { leagueIds: ['L1'] });
    await seedDetalje('vm2026', 'p2');
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p2', 'detalje', 'opdeling'))
    );
  });

  it('en IKKE-godkendt bruger KAN IKKE læse en ligakammerats detalje', async () => {
    await createUser('pend', 'player', 'pending');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'pend', { leagueIds: ['L1'] });
    await seedMembership('vm2026', 'p2', { leagueIds: ['L1'] });
    await seedDetalje('vm2026', 'p2');
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('pend').firestore(),
        'games', 'vm2026', 'players', 'p2', 'detalje', 'opdeling'))
    );
  });

  // Standardværdien i `.get('leagueIds', [])` er den, der gør reglen lukket,
  // når feltet slet ikke findes — og et players-dokument UDEN leagueIds er
  // ikke hypotetisk: puljeafregningen skriver { bonusPoints } med merge på
  // spillere, der ikke har et dokument i forvejen. Sættes standarden til noget
  // sandt, åbner detaljen for enhver godkendt bruger, og hele den øvrige suite
  // bliver stående grøn.
  it('man KAN IKKE læse detaljen for en spiller UDEN leagueIds-felt', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedMembership('vm2026', 'p2');
    await seedDetalje('vm2026', 'p2');
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p2', 'detalje', 'opdeling'))
    );
  });

  // Forlader man ligaen, ryger leagueIds af players-dokumentet, og adgangen
  // skal falde bort MED DET SAMME. `[].hasAny([...])` er den gren, der sikrer
  // det — og den var utestet, selv om reglens kommentar lover netop dette.
  it('man KAN IKKE læse detaljen for en, der har FORLADT ligaen', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedMembership('vm2026', 'p2', { leagueIds: [] });
    await seedDetalje('vm2026', 'p2');
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p2', 'detalje', 'opdeling'))
    );
  });

  // Og forlader LÆSEREN sin sidste liga, mister han adgangen til alle andres.
  it('en uden ligaer KAN IKKE læse en andens detalje', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: [] });
    await seedMembership('vm2026', 'p2', { leagueIds: ['L1'] });
    await seedDetalje('vm2026', 'p2');
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p2', 'detalje', 'opdeling'))
    );
  });

  // Klienten må ALDRIG lave en collectionGroup-query over detalje: reglen
  // slår kampen op pr. dokument, og loftet på 10 opslag rammer efter få
  // dokumenter — hvorefter HELE forespørgslen afvises, ikke bare de
  // dokumenter man ikke må se. Kommentaren i useSpillerOpdeling bygger på, at
  // reglen afviser den; her er beviset.
  it('en collectionGroup-query over detalje afvises', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedDetalje('vm2026', 'p1');
    await assertFails(
      getDocs(collectionGroup(testEnv.authenticatedContext('p1').firestore(), 'detalje'))
    );
  });

  // Rækkerne er afledt af bets og facit. Kunne man skrive dem, kunne man vise
  // sig selv med point, man ikke har fået — også sine egne.
  it('INGEN klient kan skrive i detaljen — heller ikke sin egen', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await assertFails(
      setDoc(doc(testEnv.authenticatedContext('p1').firestore(),
        'games', 'vm2026', 'players', 'p1', 'detalje', 'opdeling'),
      { uid: 'p1', kampe: { m1: { pick: '1', points: 999 } } })
    );
  });

  it('man KAN IKKE seede sin egen opdeling ved tilmelding', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    const ctx = testEnv.authenticatedContext('p1');
    await assertFails(
      setDoc(doc(ctx.firestore(), 'games', 'vm2026', 'players', 'p1'), {
        uid: 'p1', joinedAt: Timestamp.now(), opdeling: { p1x2: 999, chance: 0, combi: 0, pulje: 0 },
      })
    );
  });

  it('man KAN IKKE skrive opdeling på et eksisterende medlemskab', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { totalPoints: 5 });
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026', 'players', 'p1'),
        { opdeling: { p1x2: 999, chance: 0, combi: 0, pulje: 0 } })
    );
  });

  it('godkendt spiller KAN IKKE læse point for en man IKKE deler liga med', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await seedMembership('vm2026', 'p2', { totalPoints: 12, leagueIds: ['L2'] });
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026', 'players', 'p2'))
    );
  });

  it('uden liga kan man kun se sig selv', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1');
    await seedMembership('vm2026', 'p2', { totalPoints: 12 });
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertSucceeds(getDoc(doc(fs, 'games', 'vm2026', 'players', 'p1')));
    await assertFails(getDoc(doc(fs, 'games', 'vm2026', 'players', 'p2')));
  });

  it('admin KAN læse alle medlemskaber', async () => {
    await createUser('adm', 'globalAdmin', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p2', { totalPoints: 12, leagueIds: ['L2'] });
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext('adm').firestore(), 'games', 'vm2026', 'players', 'p2'))
    );
  });

  it('man KAN IKKE selv skrive leagueIds (serveren ejer feltet)', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { leagueIds: ['L1'] });
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026', 'players', 'p1'),
        { leagueIds: ['L1', 'L2'] })
    );
  });

  it('man KAN forlade et spil uden point (slette eget friskt medlemskab)', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1');
    await assertSucceeds(
      deleteDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026', 'players', 'p1'))
    );
  });

  it('man KAN IKKE forlade et spil hvor man HAR fået point (placering ville gå tabt)', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('vm2026');
    await seedMembership('vm2026', 'p1', { totalPoints: 8 });
    await assertFails(
      deleteDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'vm2026', 'players', 'p1'))
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: games/{gameId}/matches + games/{gameId}/bets (Fase B — spil-scoped)
// ---------------------------------------------------------------------------

/** Opret en kamp i et spil via admin-context. */
async function createGameMatch(gameId, matchId, kickoffDate) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('games').doc(gameId)
      .collection('matches').doc(matchId)
      .set({ home: 'VIB', away: 'ODE', kickoff: Timestamp.fromDate(kickoffDate), status: 'scheduled', result: null });
  });
}

describe('games/{gameId}/matches — sikkerhedsregler', () => {
  it('godkendt spiller KAN læse kampe', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl');
    await createGameMatch('sl', 'm1', new Date(Date.now() + 3600e3));
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'sl', 'matches', 'm1')));
  });
  it('en spiller KAN IKKE oprette en kamp', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl');
    await assertFails(setDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'sl', 'matches', 'm2'),
      { home: 'A', away: 'B', kickoff: Timestamp.fromDate(new Date(Date.now() + 3600e3)), status: 'scheduled' }));
  });
  it('global admin KAN oprette en kamp', async () => {
    await createUser('a1', 'globalAdmin', 'approved');
    await createGame('sl');
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('a1').firestore(), 'games', 'sl', 'matches', 'm3'),
      { home: 'A', away: 'B', kickoff: Timestamp.fromDate(new Date(Date.now() + 3600e3)), status: 'scheduled', result: null }));
  });
});

describe('games/{gameId}/bets — sikkerhedsregler', () => {
  const future = () => new Date(Date.now() + 3600e3);
  const past = () => new Date(Date.now() - 3600e3);

  it('deltager KAN tippe før kickoff (eget uid, ingen points)', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl');
    await seedMembership('sl', 'p1');
    await createGameMatch('sl', 'm1', future());
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'sl', 'bets', 'p1_m1'),
      { uid: 'p1', matchId: 'm1', homeScore: 2, awayScore: 1 }));
  });
  it('KAN IKKE lave et dublet-tip på samme kamp (doc-id skal være uid_matchId)', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl');
    await seedMembership('sl', 'p1');
    await createGameMatch('sl', 'm1', future());
    const fs = testEnv.authenticatedContext('p1').firestore();
    // Det rigtige id går igennem...
    await assertSucceeds(setDoc(doc(fs, 'games', 'sl', 'bets', 'p1_m1'),
      { uid: 'p1', matchId: 'm1', pick: '1' }));
    // ...men et ekstra dokument på SAMME kamp må ikke kunne oprettes; ellers
    // kunne man tippe 1, X og 2 og få point for dem alle.
    await assertFails(setDoc(doc(fs, 'games', 'sl', 'bets', 'p1_m1_dup'),
      { uid: 'p1', matchId: 'm1', pick: 'X' }));
    await assertFails(setDoc(doc(fs, 'games', 'sl', 'bets', 'vilkaarligt'),
      { uid: 'p1', matchId: 'm1', pick: '2' }));
  });

  // ── Hvem må se ANDRES tips? ────────────────────────────────────────────────
  // Efter kickoff, og kun hvis man deler mindst én liga. Afgrænsningen bygger
  // på leagueIds PÅ tippet — reglen skal kunne afgøres ud fra dokumentet alene.

  /** Læg et tip ind uden om reglerne (som en anden spiller ville have gjort). */
  async function seedBet(gameId, uid, matchId, data = {}) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('games').doc(gameId)
        .collection('bets').doc(`${uid}_${matchId}`)
        .set({ uid, matchId, pick: '1', ...data });
    });
  }

  it('KAN læse en liga-kammerats tip EFTER kickoff', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('sl-mate');
    await seedMembership('sl-mate', 'p1', { leagueIds: ['liga-a'] });
    await seedMembership('sl-mate', 'p2', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-mate', 'm1', past());
    await seedBet('sl-mate', 'p2', 'm1', { leagueIds: ['liga-a'] });
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
      'games', 'sl-mate', 'bets', 'p2_m1')));
  });

  it('KAN IKKE læse en liga-kammerats tip FØR kickoff', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('sl-pre');
    await seedMembership('sl-pre', 'p1', { leagueIds: ['liga-a'] });
    await seedMembership('sl-pre', 'p2', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-pre', 'm1', future());
    await seedBet('sl-pre', 'p2', 'm1', { leagueIds: ['liga-a'] });
    await assertFails(getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
      'games', 'sl-pre', 'bets', 'p2_m1')));
  });

  it('KAN IKKE læse tip fra en UDEN FOR mine ligaer — heller ikke efter kickoff', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p3', 'player', 'approved');
    await createGame('sl-outside');
    await seedMembership('sl-outside', 'p1', { leagueIds: ['liga-a'] });
    await seedMembership('sl-outside', 'p3', { leagueIds: ['liga-b'] });
    await createGameMatch('sl-outside', 'm1', past());
    await seedBet('sl-outside', 'p3', 'm1', { leagueIds: ['liga-b'] });
    await assertFails(getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
      'games', 'sl-outside', 'bets', 'p3_m1')));
  });

  it('KAN IKKE læse tip uden leagueIds (fx skrevet før feltet fandtes)', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('sl-nofield');
    await seedMembership('sl-nofield', 'p1', { leagueIds: ['liga-a'] });
    await seedMembership('sl-nofield', 'p2', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-nofield', 'm1', past());
    await seedBet('sl-nofield', 'p2', 'm1'); // ingen leagueIds
    await assertFails(getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
      'games', 'sl-nofield', 'bets', 'p2_m1')));
  });

  it('KAN altid læse sit EGET tip — også før kickoff og uden ligaer', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl-own');
    await seedMembership('sl-own', 'p1');
    await createGameMatch('sl-own', 'm1', future());
    await seedBet('sl-own', 'p1', 'm1');
    await assertSucceeds(getDoc(doc(testEnv.authenticatedContext('p1').firestore(),
      'games', 'sl-own', 'bets', 'p1_m1')));
  });

  it('KAN IKKE skrive en FREMMED ligas id på sit tip', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl-foreign');
    await seedMembership('sl-foreign', 'p1', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-foreign', 'm1', future());
    // liga-b er ikke min — det ville invitere mig ind i deres visning.
    await assertFails(setDoc(doc(testEnv.authenticatedContext('p1').firestore(),
      'games', 'sl-foreign', 'bets', 'p1_m1'),
    { uid: 'p1', matchId: 'm1', pick: '1', leagueIds: ['liga-a', 'liga-b'] }));
    // Egne ligaer går igennem.
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext('p1').firestore(),
      'games', 'sl-foreign', 'bets', 'p1_m1'),
    { uid: 'p1', matchId: 'm1', pick: '1', leagueIds: ['liga-a'] }));
  });

  // ── Tippet må ikke kunne pege et andet sted hen ────────────────────────────
  // uid_matchId-bindingen håndhæves kun ved create. Uden uforanderlige uid og
  // matchId kunne man rette sit EGET tip om bagefter.

  it('KAN IKKE skifte uid på sit tip (opdigtet tip i en andens navn)', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('sl-immuid');
    await seedMembership('sl-immuid', 'p1', { leagueIds: ['liga-a'] });
    await seedMembership('sl-immuid', 'p2', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-immuid', 'm1', future());
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertSucceeds(setDoc(doc(fs, 'games', 'sl-immuid', 'bets', 'p1_m1'),
      { uid: 'p1', matchId: 'm1', pick: '1', leagueIds: ['liga-a'] }));
    // Doc-id'et er stadig p1_m1, så p2's eget tip ville bestå — men serveren
    // summerer på uid, så forfalskningen ville tælle i p2's total.
    await assertFails(updateDoc(doc(fs, 'games', 'sl-immuid', 'bets', 'p1_m1'),
      { uid: 'p2', pick: '2' }));
  });

  it('KAN IKKE flytte sit tip til en anden kamp (tip efter kickoff + dublet)', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl-immmatch');
    await seedMembership('sl-immmatch', 'p1', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-immmatch', 'senere', future());
    await createGameMatch('sl-immmatch', 'igang', past());
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertSucceeds(setDoc(doc(fs, 'games', 'sl-immmatch', 'bets', 'p1_senere'),
      { uid: 'p1', matchId: 'senere', pick: '1', leagueIds: ['liga-a'] }));
    // Kickoff-tjekket slår op på det GAMLE matchId, så uden vagten ville dette
    // være et tip på en kamp, der allerede er i gang.
    await assertFails(updateDoc(doc(fs, 'games', 'sl-immmatch', 'bets', 'p1_senere'),
      { matchId: 'igang', pick: '2' }));
  });

  it('KAN stadig rette sit valg og sin Chancen-indsats før kickoff', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl-edit');
    await seedMembership('sl-edit', 'p1', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-edit', 'm1', future());
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertSucceeds(setDoc(doc(fs, 'games', 'sl-edit', 'bets', 'p1_m1'),
      { uid: 'p1', matchId: 'm1', pick: '1', chanceStake: 0, leagueIds: ['liga-a'] }));
    // Klienten skriver med merge og sender uid/matchId med uændret — det skal
    // stadig gå igennem.
    await assertSucceeds(setDoc(doc(fs, 'games', 'sl-edit', 'bets', 'p1_m1'),
      { uid: 'p1', matchId: 'm1', pick: 'X', chanceStake: 3, leagueIds: ['liga-a'] },
      { merge: true }));
  });

  // ── Selve FORESPØRGSLEN, ikke bare enkeltdokumenter ────────────────────────
  // Alle øvrige regel-tests bruger getDoc. Men det er list-forespørgslen, der
  // afgør, om funktionen virker: kan reglen ikke afgøres for hvert dokument,
  // afvises HELE forespørgslen — ikke bare de dokumenter, man ikke må se.

  it('klientens forespørgsel (matchId + array-contains-any) lykkes', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('sl-q-ok');
    await seedMembership('sl-q-ok', 'p1', { leagueIds: ['liga-a'] });
    await seedMembership('sl-q-ok', 'p2', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-q-ok', 'm1', past());
    await seedBet('sl-q-ok', 'p2', 'm1', { leagueIds: ['liga-a'] });
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertSucceeds(getDocs(query(
      collection(fs, 'games', 'sl-q-ok', 'bets'),
      where('matchId', '==', 'm1'),
      where('leagueIds', 'array-contains-any', ['liga-a']),
    )));
  });

  it('samme forespørgsel UDEN liga-filteret afvises helt', async () => {
    await createUser('p1', 'player', 'approved');
    await createUser('p2', 'player', 'approved');
    await createGame('sl-q-bred');
    await seedMembership('sl-q-bred', 'p1', { leagueIds: ['liga-a'] });
    await seedMembership('sl-q-bred', 'p2', { leagueIds: ['liga-a'] });
    await createGameMatch('sl-q-bred', 'm1', past());
    await seedBet('sl-q-bred', 'p2', 'm1', { leagueIds: ['liga-a'] });
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertFails(getDocs(query(
      collection(fs, 'games', 'sl-q-bred', 'bets'),
      where('matchId', '==', 'm1'),
    )));
  });

  it('MyTips-forespørgslen (mine egne tips) virker stadig efter stramningen', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl-q-mine');
    await seedMembership('sl-q-mine', 'p1');
    await createGameMatch('sl-q-mine', 'm1', future());
    await seedBet('sl-q-mine', 'p1', 'm1');
    const fs = testEnv.authenticatedContext('p1').firestore();
    await assertSucceeds(getDocs(query(
      collection(fs, 'games', 'sl-q-mine', 'bets'),
      where('uid', '==', 'p1'),
    )));
  });

  it('IKKE-deltager KAN IKKE tippe (mangler players-dok)', async () => {
    await createUser('p2', 'player', 'approved');
    await createGame('sl');
    await createGameMatch('sl', 'm1', future());
    await assertFails(setDoc(doc(testEnv.authenticatedContext('p2').firestore(), 'games', 'sl', 'bets', 'p2_m1'),
      { uid: 'p2', matchId: 'm1', homeScore: 1, awayScore: 0 }));
  });
  it('KAN IKKE tippe efter kickoff', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl');
    await seedMembership('sl', 'p1');
    await createGameMatch('sl', 'm1', past());
    await assertFails(setDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'sl', 'bets', 'p1_m1'),
      { uid: 'p1', matchId: 'm1', homeScore: 2, awayScore: 1 }));
  });
  it('KAN IKKE seede points på sit tip', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl');
    await seedMembership('sl', 'p1');
    await createGameMatch('sl', 'm1', future());
    await assertFails(setDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'sl', 'bets', 'p1_m1'),
      { uid: 'p1', matchId: 'm1', homeScore: 2, awayScore: 1, points: 5 }));
  });
  it('KAN IKKE tippe i en andens navn', async () => {
    await createUser('p1', 'player', 'approved');
    await createGame('sl');
    await seedMembership('sl', 'p1');
    await createGameMatch('sl', 'm1', future());
    await assertFails(setDoc(doc(testEnv.authenticatedContext('p1').firestore(), 'games', 'sl', 'bets', 'p2_m1'),
      { uid: 'p2', matchId: 'm1', homeScore: 2, awayScore: 1 }));
  });
});

// ---------------------------------------------------------------------------
// TESTS: games/{gameId}/leagues — private mini-ligaer + liga-spørgsmål
// ---------------------------------------------------------------------------
describe('games/{gameId}/leagues — sikkerhedsregler', () => {
  /** Opret en spil-liga via admin-context. */
  async function seedGameLeague(gameId, leagueId, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('games').doc(gameId)
        .collection('leagues').doc(leagueId)
        .set({ name: 'Ligaen', code: 'KODE12', createdAt: Timestamp.now(), ...data });
    });
  }
  /** Opret et liga-spørgsmål + et svar via admin-context. */
  async function seedQuestionAndAnswer(gameId, leagueId, qid, question, answers) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const lg = ctx.firestore().collection('games').doc(gameId).collection('leagues').doc(leagueId);
      await lg.collection('questions').doc(qid).set({
        label: 'Hvem bliver topscorer?', type: 'text', points: 5,
        facit: null, deadline: null, createdAt: Timestamp.now(), ...question,
      });
      for (const [uid, answer] of Object.entries(answers)) {
        await lg.collection('questionAnswers').doc(`${qid}_${uid}`).set({ uid, questionId: qid, answer });
      }
    });
  }

  // -------------------------------------------------------------------------
  // startRound — feltet, der afgør hvilke RUNDER der tæller i ligaens
  // stilling. Ejeren skriver det fra browseren, så valideringen SKAL stå i
  // reglen: uden den kunne en streng eller et decimaltal lande i basen og
  // aldrig matche `m.round` — gaten ville tavst holde op med at virke.
  // -------------------------------------------------------------------------
  it('ejeren KAN sætte en gyldig startrunde', async () => {
    await createUser('own', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lgR1', { ownerUid: 'own', memberUids: ['own'] });
    const fs = testEnv.authenticatedContext('own').firestore();
    await assertSucceeds(updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lgR1'), { startRound: 3 }));
    await assertSucceeds(updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lgR1'), { startRound: null }));
  });

  it('ejeren KAN IKKE skrive en ugyldig startrunde', async () => {
    await createUser('own', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lgR2', { ownerUid: 'own', memberUids: ['own'] });
    const fs = testEnv.authenticatedContext('own').firestore();
    // Streng, decimaltal, nul og negativ: de to første ville stå i basen og
    // aldrig matche kampens rundenummer; nul og negativ er meningsløse for en
    // liga — "ingen gate" udtrykkes med null, ikke 0.
    await assertFails(updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lgR2'), { startRound: '3' }));
    await assertFails(updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lgR2'), { startRound: 3.5 }));
    await assertFails(updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lgR2'), { startRound: 0 }));
    await assertFails(updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lgR2'), { startRound: -1 }));
  });

  it('en liga kan ikke OPRETTES med en ugyldig startrunde', async () => {
    await createUser('own2', 'player', 'approved');
    await createGame('sl');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('games').doc('sl')
        .collection('players').doc('own2').set({ uid: 'own2' });
    });
    const fs = testEnv.authenticatedContext('own2').firestore();
    const nyLiga = (id, ekstra) => setDoc(doc(fs, 'games', 'sl', 'leagues', id), {
      name: 'Ny liga', code: 'KODE99', ownerUid: 'own2', memberUids: ['own2'],
      createdAt: Timestamp.now(), ...ekstra,
    });
    await assertFails(nyLiga('lgC1', { startRound: '3' }));
    await assertFails(nyLiga('lgC2', { startRound: 0 }));
    // …og en gyldig går igennem — valideringen må ikke lukke oprettelsen.
    await assertSucceeds(nyLiga('lgC3', { startRound: 3 }));
    await assertSucceeds(nyLiga('lgC4', {}));
  });

  it('et MEDLEM kan ikke sætte startrunden', async () => {
    await createUser('vic', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lgR3', { ownerUid: 'own', memberUids: ['own', 'vic'] });
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('vic').firestore(), 'games', 'sl', 'leagues', 'lgR3'),
        { startRound: 3 })
    );
  });

  it('et medlem, der forlader, kan ikke SAMTIDIG flytte gaten', async () => {
    await createUser('vic', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lgR4', { ownerUid: 'own', memberUids: ['own', 'vic'], startRound: 2 });
    await assertFails(
      updateDoc(doc(testEnv.authenticatedContext('vic').firestore(), 'games', 'sl', 'leagues', 'lgR4'),
        { memberUids: ['own'], startRound: 9 })
    );
    // …men at forlade UDEN at røre gaten virker stadig.
    await assertSucceeds(
      updateDoc(doc(testEnv.authenticatedContext('vic').firestore(), 'games', 'sl', 'leagues', 'lgR4'),
        { memberUids: ['own'] })
    );
  });

  it('et medlem KAN forlade ligaen (fjerner KUN sig selv)', async () => {
    await createUser('vic', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lg1', { ownerUid: 'own', memberUids: ['own', 'vic', 'ven'] });

    await assertSucceeds(
      updateDoc(doc(testEnv.authenticatedContext('vic').firestore(), 'games', 'sl', 'leagues', 'lg1'),
        { memberUids: ['own', 'ven'] })
    );
  });

  it('et medlem KAN IKKE omskrive medlemslisten (smide ud / lukke fremmede ind)', async () => {
    await createUser('vic', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lg1', { ownerUid: 'own', memberUids: ['own', 'vic', 'ven'] });

    const fs = testEnv.authenticatedContext('vic').firestore();
    // Fjerner sig selv, men smider samtidig 'ven' ud og lukker 'mal' ind.
    await assertFails(
      updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lg1'), { memberUids: ['own', 'mal'] })
    );
    // Samme antal, men en fremmed byttet ind.
    await assertFails(
      updateDoc(doc(fs, 'games', 'sl', 'leagues', 'lg1'), { memberUids: ['own', 'mal', 'ven'] })
    );
  });

  it('en udenforstående KAN IKKE læse en privat spil-liga', async () => {
    await createUser('outsider', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lg1', { ownerUid: 'own', memberUids: ['own'] });

    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('outsider').firestore(), 'games', 'sl', 'leagues', 'lg1'))
    );
  });

  it('et medlem KAN IKKE se andres svar før spørgsmålet er lukket', async () => {
    await createUser('vic', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lg1', { ownerUid: 'own', memberUids: ['own', 'vic'] });
    await seedQuestionAndAnswer('sl', 'lg1', 'q1', {}, { own: 'Isaksen', vic: 'Cornelius' });

    const fs = testEnv.authenticatedContext('vic').firestore();
    // Eget svar må man altid se...
    await assertSucceeds(getDoc(doc(fs, 'games', 'sl', 'leagues', 'lg1', 'questionAnswers', 'q1_vic')));
    // ...men ikke de andres, så længe spørgsmålet er åbent.
    await assertFails(getDoc(doc(fs, 'games', 'sl', 'leagues', 'lg1', 'questionAnswers', 'q1_own')));
  });

  it('andres svar bliver læsbare når facit er sat', async () => {
    await createUser('vic', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lg1', { ownerUid: 'own', memberUids: ['own', 'vic'] });
    await seedQuestionAndAnswer('sl', 'lg1', 'q1', { facit: 'Isaksen' }, { own: 'Isaksen' });

    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext('vic').firestore(),
        'games', 'sl', 'leagues', 'lg1', 'questionAnswers', 'q1_own'))
    );
  });

  it('andres svar bliver læsbare når deadline er passeret', async () => {
    await createUser('vic', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lg1', { ownerUid: 'own', memberUids: ['own', 'vic'] });
    await seedQuestionAndAnswer('sl', 'lg1', 'q1', { deadline: Date.now() - 3600e3 }, { own: 'Isaksen' });

    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext('vic').firestore(),
        'games', 'sl', 'leagues', 'lg1', 'questionAnswers', 'q1_own'))
    );
  });

  it('en udenforstående KAN IKKE se svar overhovedet', async () => {
    await createUser('outsider', 'player', 'approved');
    await createGame('sl');
    await seedGameLeague('sl', 'lg1', { ownerUid: 'own', memberUids: ['own'] });
    await seedQuestionAndAnswer('sl', 'lg1', 'q1', { facit: 'Isaksen' }, { own: 'Isaksen' });

    await assertFails(
      getDoc(doc(testEnv.authenticatedContext('outsider').firestore(),
        'games', 'sl', 'leagues', 'lg1', 'questionAnswers', 'q1_own'))
    );
  });
});

// ---------------------------------------------------------------------------
// TESTS: hullerne fundet ved sæsoneftersynet (august 2026).
//
// Fælles mønster for de fleste: et felt er BUNDET ved create (via doc-id eller
// et eksplicit tjek), men frit ved update — og selve autorisationen længere
// nede læser det GAMLE felt. Derfor er den negative test her altid en update
// på et dokument, der ER oprettet lovligt.
//
// Hver test bruger sine EGNE id'er. Med genbrugte id'er kan klientens cache
// svare på en læsning, og så beviser en grøn test ingenting.
// ---------------------------------------------------------------------------
describe('sæsoneftersyn — uforanderlige felter og lukkede bagdøre', () => {
  const iMorgen = () => new Date(Date.now() + 3600e3);
  const iGaar = () => new Date(Date.now() - 3600e3);

  /** Læg et lovligt oprettet dokument ind udenom reglerne. */
  async function seed(path, data) {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(path).set(data);
    });
  }

  // --- 1) stageBets: uid og stageId er uforanderlige ------------------------
  describe('stageBets/{id} — update', () => {
    it('KAN rette sit eget etape-tip (kontrol: reglen spærrer ikke normal brug)', async () => {
      await createUser('se1a', 'player', 'approved');
      await createStage('se-st-a', iMorgen());
      await seed('stageBets/se1a_se-st-a', { uid: 'se1a', stageId: 'se-st-a', winnerTeam: 'UAE' });

      await assertSucceeds(updateDoc(
        doc(testEnv.authenticatedContext('se1a').firestore(), 'stageBets', 'se1a_se-st-a'),
        { winnerTeam: 'VIS' },
      ));
    });

    it('KAN IKKE skrive sit eget tip om til en andens navn', async () => {
      await createUser('se1b', 'player', 'approved');
      await createStage('se-st-b', iMorgen());
      await seed('stageBets/se1b_se-st-b', { uid: 'se1b', stageId: 'se-st-b', winnerTeam: 'UAE' });

      // Dagsstillingen grupperer på uid-FELTET, ikke på doc-id'et.
      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('se1b').firestore(), 'stageBets', 'se1b_se-st-b'),
        { uid: 'offer' },
      ));
    });

    it('KAN IKKE pege tippet over på en etape, der allerede er kørt', async () => {
      await createUser('se1c', 'player', 'approved');
      await createStage('se-st-c', iMorgen());   // åben — kickoff-tjekket læser DENNE
      await createStage('se-st-c2', iGaar());    // kørt
      await seed('stageBets/se1c_se-st-c', { uid: 'se1c', stageId: 'se-st-c', winnerTeam: 'UAE' });

      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('se1c').firestore(), 'stageBets', 'se1c_se-st-c'),
        { stageId: 'se-st-c2', winnerTeam: 'POG' },
      ));
    });
  });

  // --- 2) bonusBets: uid og questionId er uforanderlige ---------------------
  describe('bonusBets/{id} — update', () => {
    it('KAN rette sit eget bonussvar (kontrol)', async () => {
      await createUser('se2a', 'player', 'approved');
      await createBonusQuestion('se-bq-a', iMorgen());
      await seed('bonusBets/se2a_se-bq-a', { uid: 'se2a', questionId: 'se-bq-a', answer: 'BRA' });

      await assertSucceeds(updateDoc(
        doc(testEnv.authenticatedContext('se2a').firestore(), 'bonusBets', 'se2a_se-bq-a'),
        { answer: 'ARG' },
      ));
    });

    it('KAN IKKE skrive sit eget bonussvar om til en andens navn', async () => {
      await createUser('se2b', 'player', 'approved');
      await createBonusQuestion('se-bq-b', iMorgen());
      await seed('bonusBets/se2b_se-bq-b', { uid: 'se2b', questionId: 'se-bq-b', answer: 'BRA' });

      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('se2b').firestore(), 'bonusBets', 'se2b_se-bq-b'),
        { uid: 'offer' },
      ));
    });

    it('KAN IKKE flytte svaret over på et LUKKET spørgsmål (facit i hånden)', async () => {
      await createUser('se2c', 'player', 'approved');
      await createBonusQuestion('se-bq-c', iMorgen());   // åbent — deadline-tjekket læser DENNE
      await createBonusQuestion('se-bq-c2', iGaar());    // lukket
      await seed('bonusBets/se2c_se-bq-c', { uid: 'se2c', questionId: 'se-bq-c', answer: 'BRA' });

      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('se2c').firestore(), 'bonusBets', 'se2c_se-bq-c'),
        { questionId: 'se-bq-c2', answer: 'URU' },
      ));
    });
  });

  // --- 3) leagueBonus: leagueId er uforanderligt ---------------------------
  describe('leagueBonus/{qid} — update', () => {
    async function toLigaer() {
      await createUser('se3', 'player', 'approved');
      await createLeague('se-egen', 'se3', ['se3']);     // min egen liga — jeg er manager
      await createLeague('se-fremmed', 'anden', ['anden']);
    }

    it('en manager KAN rette sit eget spørgsmål (kontrol)', async () => {
      await toLigaer();
      await seed('leagueBonus/se-q3a', {
        leagueId: 'se-egen', createdBy: 'se3', type: 'text', label: 'Hvem?',
        facit: null, deadline: Timestamp.fromDate(iMorgen()),
      });

      await assertSucceeds(updateDoc(
        doc(testEnv.authenticatedContext('se3').firestore(), 'leagueBonus', 'se-q3a'),
        { label: 'Hvem vinder?' },
      ));
    });

    it('KAN IKKE flytte sit spørgsmål ind i en FREMMED ligas stilling', async () => {
      await toLigaer();
      await seed('leagueBonus/se-q3b', {
        leagueId: 'se-egen', createdBy: 'se3', type: 'text', label: 'Hvem?',
        facit: null, deadline: Timestamp.fromDate(iMorgen()),
      });

      // Autorisationen læser det GAMLE leagueId, hvor jeg ER manager.
      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('se3').firestore(), 'leagueBonus', 'se-q3b'),
        { leagueId: 'se-fremmed' },
      ));
    });
  });

  // --- 4) leagueBonusAnswers: medlemskab måles på SPØRGSMÅLETS liga --------
  describe('leagueBonusAnswers/{id} — create', () => {
    async function toLigaerOgEtSpoergsmaal(qid) {
      await createUser('se4', 'player', 'approved');
      await createLeague('se4-egen', 'se4', ['se4']);
      await createLeague('se4-fremmed', 'vaert', ['vaert']);
      await seed(`leagueBonus/${qid}`, {
        leagueId: 'se4-fremmed', createdBy: 'vaert', type: 'text', label: 'Hvem?',
        facit: null, deadline: Timestamp.fromDate(iMorgen()),
      });
    }

    it('et medlem KAN svare på sin EGEN ligas spørgsmål (kontrol)', async () => {
      await createUser('se4b', 'player', 'approved');
      await createLeague('se4b-liga', 'vaert', ['vaert', 'se4b']);
      await seed('leagueBonus/se-q4b', {
        leagueId: 'se4b-liga', createdBy: 'vaert', type: 'text', label: 'Hvem?',
        facit: null, deadline: Timestamp.fromDate(iMorgen()),
      });

      await assertSucceeds(setDoc(
        doc(testEnv.authenticatedContext('se4b').firestore(), 'leagueBonusAnswers', 'se-q4b_se4b'),
        { questionId: 'se-q4b', leagueId: 'se4b-liga', uid: 'se4b', answer: 'Messi' },
      ));
    });

    it('en udenforstående KAN IKKE svare ved at sætte sin EGEN ligas id på svaret', async () => {
      await toLigaerOgEtSpoergsmaal('se-q4a');

      // Scoringen henter svar med where('questionId','==',…) UDEN liga-filter,
      // så et svar med forkert leagueId ville tælle med i den fremmede liga.
      await assertFails(setDoc(
        doc(testEnv.authenticatedContext('se4').firestore(), 'leagueBonusAnswers', 'se-q4a_se4'),
        { questionId: 'se-q4a', leagueId: 'se4-egen', uid: 'se4', answer: 'Messi' },
      ));
    });

    it('en udenforstående KAN IKKE svare med det RIGTIGE leagueId heller', async () => {
      await toLigaerOgEtSpoergsmaal('se-q4c');

      await assertFails(setDoc(
        doc(testEnv.authenticatedContext('se4').firestore(), 'leagueBonusAnswers', 'se-q4c_se4'),
        { questionId: 'se-q4c', leagueId: 'se4-fremmed', uid: 'se4', answer: 'Messi' },
      ));
    });
  });

  // --- 5+9) games/…/questions: point-loft, deadline kun fremad, facit ------
  describe('games/{g}/leagues/{l}/questions/{q} — update', () => {
    /** Liga med ejer 'se5' + ét spørgsmål. */
    async function seedSpoergsmaal(leagueId, qid, q = {}) {
      await createUser('se5', 'player', 'approved');
      await createGame('se-spil');
      await seed(`games/se-spil/leagues/${leagueId}`, {
        name: 'Ligaen', code: 'SE5KOD', ownerUid: 'se5', memberUids: ['se5', 'ven'],
        createdAt: Timestamp.now(),
      });
      await seed(`games/se-spil/leagues/${leagueId}/questions/${qid}`, {
        label: 'Hvem bliver topscorer?', type: 'text', points: 5,
        facit: null, deadline: null, createdBy: 'se5', createdAt: Timestamp.now(), ...q,
      });
    }
    const qDoc = (leagueId, qid) => doc(
      testEnv.authenticatedContext('se5').firestore(),
      'games', 'se-spil', 'leagues', leagueId, 'questions', qid,
    );

    it('ejeren KAN rette teksten på sit spørgsmål (kontrol)', async () => {
      await seedSpoergsmaal('se5-l1', 'se-q5a');
      await assertSucceeds(updateDoc(qDoc('se5-l1', 'se-q5a'), { label: 'Hvem scorer flest?' }));
    });

    it('ejeren KAN IKKE hæve pointene over loftet bagefter', async () => {
      await seedSpoergsmaal('se5-l2', 'se-q5b');
      // Loftet på 100 gjaldt kun ved oprettelse.
      await assertFails(updateDoc(qDoc('se5-l2', 'se-q5b'), { points: 100000 }));
    });

    it('ejeren KAN IKKE sætte pointene til nul eller negativt', async () => {
      await seedSpoergsmaal('se5-l3', 'se-q5c');
      await assertFails(updateDoc(qDoc('se5-l3', 'se-q5c'), { points: 0 }));
    });

    it('ejeren KAN rykke deadline FREMAD (kontrol)', async () => {
      await seedSpoergsmaal('se5-l4', 'se-q5d', { deadline: Date.now() + 3600e3 });
      await assertSucceeds(updateDoc(qDoc('se5-l4', 'se-q5d'), { deadline: Date.now() + 7200e3 }));
    });

    it('ejeren KAN IKKE rulle deadline TILBAGE (åbne kortene og lukke dem igen)', async () => {
      await seedSpoergsmaal('se5-l5', 'se-q5e', { deadline: Date.now() + 7200e3 });
      // Rullet tilbage bliver alles svar læsbare — og bagefter kan den rulles frem igen.
      await assertFails(updateDoc(qDoc('se5-l5', 'se-q5e'), { deadline: Date.now() - 3600e3 }));
    });

    it('ejeren KAN rette et forkert facit (kontrol)', async () => {
      await seedSpoergsmaal('se5-l6', 'se-q5f', { facit: 'Isaksen' });
      await assertSucceeds(updateDoc(qDoc('se5-l6', 'se-q5f'), { facit: 'Cornelius' }));
    });

    it('ejeren KAN IKKE fjerne facit igen (samme kig-i-kortene ad bagvejen)', async () => {
      await seedSpoergsmaal('se5-l7', 'se-q5g', { facit: 'Isaksen' });
      // Sat facit → alles svar er læsbare. Fjernet igen → man må svare igen.
      await assertFails(updateDoc(qDoc('se5-l7', 'se-q5g'), { facit: null }));
    });

    it('ejeren KAN IKKE fjerne deadline, efter den er passeret', async () => {
      await seedSpoergsmaal('se5-l8', 'se-q5h', { deadline: Date.now() - 3600e3 });
      // Passeret deadline → alles svar er læsbare. Fjernet → man må svare igen,
      // for svar-reglen åbner ved deadline == null.
      await assertFails(updateDoc(qDoc('se5-l8', 'se-q5h'), { deadline: null }));
    });

    it('ejeren KAN IKKE fjerne en ÅBEN deadline', async () => {
      await seedSpoergsmaal('se5-l15', 'se-q5o', { deadline: Date.now() + 3600e3 });
      // Ingen har kigget endnu, så der er intet at vinde her og nu — men et
      // spørgsmål uden deadline kan aldrig lukke af sig selv igen.
      await assertFails(updateDoc(qDoc('se5-l15', 'se-q5o'), { deadline: null }));
    });

    it('ejeren KAN IKKE rykke en PASSERET deadline frem igen', async () => {
      await seedSpoergsmaal('se5-l9', 'se-q5i', { deadline: Date.now() - 3600e3 });
      // Fremad er kun harmløst, så længe kortene endnu er lukkede.
      await assertFails(updateDoc(qDoc('se5-l9', 'se-q5i'), { deadline: Date.now() + 3600e3 }));
    });

    it('ejeren KAN sætte en deadline første gang (kontrol)', async () => {
      await seedSpoergsmaal('se5-l10', 'se-q5j');   // deadline: null
      await assertSucceeds(updateDoc(qDoc('se5-l10', 'se-q5j'), { deadline: Date.now() + 3600e3 }));
    });

    // Klientens ENESTE update-vej (setLeagueQuestionFacit), og den bruges typisk
    // EFTER deadline. Uden denne kontrol kunne deadline-betingelsen strammes til
    // noget, der spærrer selve produktionsstien, uden at nogen test blev rød.
    it('ejeren KAN sætte facit EFTER deadline (kontrol — produktionsstien)', async () => {
      await seedSpoergsmaal('se5-l11', 'se-q5k', { deadline: Date.now() - 3600e3 });
      await assertSucceeds(updateDoc(qDoc('se5-l11', 'se-q5k'),
        { facit: 'Isaksen', acceptedAnswers: [] }));
    });

    it('præcis 100 point er tilladt ved update (grænsen)', async () => {
      await seedSpoergsmaal('se5-l12', 'se-q5l', { points: 100 });
      await assertSucceeds(updateDoc(qDoc('se5-l12', 'se-q5l'), { label: 'Hvem scorer flest?' }));
    });

    it('point som TEKST afvises (loftet kan ellers omgås med en streng)', async () => {
      await seedSpoergsmaal('se5-l13', 'se-q5m');
      await assertFails(updateDoc(qDoc('se5-l13', 'se-q5m'), { points: '9999' }));
    });

    it('flere felter på én gang redder ikke en ulovlig deadline', async () => {
      await seedSpoergsmaal('se5-l14', 'se-q5n', { deadline: Date.now() + 7200e3 });
      await assertFails(updateDoc(qDoc('se5-l14', 'se-q5n'),
        { label: 'Nyt spørgsmål', points: 10, deadline: Date.now() - 3600e3 }));
    });

    // botFacitAt er SERVERENS markør for "Runde-Botten har postet afsløringen"
    // (opgave #39). Kunne ejeren sætte den selv, kunne hen lydløst aflyse
    // afsløringen af sit eget spørgsmål — begge skriveveje skal være lukket.
    it('ejeren KAN IKKE sætte bottens markør ved UPDATE', async () => {
      await seedSpoergsmaal('se5-l16', 'se-q5p', { facit: 'Isaksen' });
      await assertFails(updateDoc(qDoc('se5-l16', 'se-q5p'), { botFacitAt: Timestamp.now() }));
    });

    it('ejeren KAN IKKE smugle markøren med i en ellers lovlig update', async () => {
      await seedSpoergsmaal('se5-l17', 'se-q5q');
      await assertFails(updateDoc(qDoc('se5-l17', 'se-q5q'),
        { label: 'Nyt spørgsmål', botFacitAt: Timestamp.now() }));
    });

    it('ejeren KAN IKKE oprette spørgsmålet med markøren allerede sat (create-vejen)', async () => {
      await seedSpoergsmaal('se5-l18', 'se-q5r'); // opretter liga + bruger
      await assertFails(setDoc(qDoc('se5-l18', 'se-q5r-ny'), {
        label: 'Hvem bliver topscorer?', type: 'text', points: 5,
        facit: null, deadline: null, createdBy: 'se5', createdAt: Timestamp.now(),
        botFacitAt: Timestamp.now(),
      }));
    });

    it('oprettelse UDEN markør virker stadig (kontrol af create-vagten)', async () => {
      await seedSpoergsmaal('se5-l19', 'se-q5s');
      await assertSucceeds(setDoc(qDoc('se5-l19', 'se-q5s-ny'), {
        label: 'Hvem bliver topscorer?', type: 'text', points: 5,
        facit: null, deadline: null, createdBy: 'se5', createdAt: Timestamp.now(),
      }));
    });

    // Slet-og-genopret med samme doc-id var en omvej uden om HELE
    // "kortene kan ikke lukkes igen"-garantien: svar kan aldrig slettes og
    // har deterministiske id'er, så et genoprettet spørgsmål arver alles
    // svar — sæt facit → læs svar → slet → genopret → ret eget svar → facit
    // (Security-fund, begge veje). Kun et U-ÅBNET spørgsmål må slettes.
    it('ejeren KAN IKKE slette et spørgsmål med facit sat', async () => {
      await seedSpoergsmaal('se5-l20', 'se-q5t', { facit: 'Isaksen' });
      await assertFails(deleteDoc(qDoc('se5-l20', 'se-q5t')));
    });

    it('ejeren KAN IKKE slette et spørgsmål med passeret deadline (kortene er åbne)', async () => {
      await seedSpoergsmaal('se5-l21', 'se-q5u', { deadline: Date.now() - 3600e3 });
      await assertFails(deleteDoc(qDoc('se5-l21', 'se-q5u')));
    });

    it('ejeren KAN stadig slette et U-ÅBNET spørgsmål (kontrol)', async () => {
      await seedSpoergsmaal('se5-l22', 'se-q5v', { deadline: Date.now() + 3600e3 });
      await assertSucceeds(deleteDoc(qDoc('se5-l22', 'se-q5v')));
    });
  });

  // --- spil-liga-væggen: 'system' er bottens kendetegn -----------------------
  // Runde-Botten skriver med Admin SDK (uid 'runde-bot', system:true). uid er
  // bundet af reglen, men uden system-vagten kunne et medlem gemme
  // displayName 'Runde-Botten' + system:true, forlade ligaen — og opslaget
  // ville stå som bottens for alle (Security-fund, #39).
  describe('games/{g}/leagues/{l}/messages — bot-forfalskning', () => {
    async function seedVaeg(leagueId) {
      await createUser('se6', 'player', 'approved');
      await createGame('se-spil');
      await seed(`games/se-spil/leagues/${leagueId}`, {
        name: 'Ligaen', code: 'SE6KOD', ownerUid: 'se6', memberUids: ['se6', 'ven'],
        createdAt: Timestamp.now(),
      });
    }
    const mDoc = (leagueId, id) => doc(
      testEnv.authenticatedContext('se6').firestore(),
      'games', 'se-spil', 'leagues', leagueId, 'messages', id,
    );

    it("et medlem KAN IKKE skrive en besked med 'system'-feltet — uanset værdi", async () => {
      await seedVaeg('se6-l1');
      await assertFails(setDoc(mDoc('se6-l1', 'm1'), {
        uid: 'se6', displayName: 'Runde-Botten', avatarEmoji: '🤖', system: true,
        text: 'Falsk bot-opslag', createdAt: Timestamp.now(),
      }));
      await assertFails(setDoc(mDoc('se6-l1', 'm2'), {
        uid: 'se6', system: false, text: 'Også med false', createdAt: Timestamp.now(),
      }));
    });

    it('en almindelig besked uden system-feltet virker stadig (kontrol)', async () => {
      await seedVaeg('se6-l2');
      await assertSucceeds(setDoc(mDoc('se6-l2', 'm1'), {
        uid: 'se6', text: 'Hej liga!', createdAt: Timestamp.now(),
      }));
    });
  });

  // --- 6) messages: BEGGE deltagere skal være medlemmer --------------------
  describe('messages/{id} — create', () => {
    it('KAN IKKE lukke en fremmed ind i samtalen ved at sætte to = sig selv', async () => {
      await createUser('se6', 'player', 'approved');
      await createUser('se6frem', 'player', 'approved');
      await createLeague('se6-liga', 'se6', ['se6']);

      // De gamle tjek så på afsenderen og 'to' — begge mig selv. 'se6frem'
      // stod kun i participants, som er dét, LÆSEREGLEN bruger.
      await assertFails(setDoc(
        doc(testEnv.authenticatedContext('se6').firestore(), 'messages', 'se-m6'),
        {
          participants: ['se6', 'se6frem'], conversationId: 'se6__se6frem',
          from: 'se6', to: 'se6', leagueId: 'se6-liga', text: 'Hej',
          createdAt: Timestamp.now(),
        },
      ));
    });

    // Samme angreb spejlvendt. Uden denne er kun det ene af de to
    // participants-tjek bevist — og et af dem kunne fjernes ubemærket.
    it('KAN IKKE lukke en fremmed ind, når den fremmede står FØRST', async () => {
      await createUser('se6b', 'player', 'approved');
      await createUser('aafrem', 'player', 'approved');   // sorterer før 'se6b'
      await createLeague('se6b-liga', 'se6b', ['se6b']);

      await assertFails(setDoc(
        doc(testEnv.authenticatedContext('se6b').firestore(), 'messages', 'se-m6b'),
        {
          participants: ['aafrem', 'se6b'], conversationId: 'aafrem__se6b',
          from: 'se6b', to: 'se6b', leagueId: 'se6b-liga', text: 'Hej',
          createdAt: Timestamp.now(),
        },
      ));
    });
  });

  // --- 7) users: heller ikke en admin skriver point ------------------------
  describe('users/{uid} — global admin', () => {
    it('en global admin KAN stadig godkende en bruger (kontrol)', async () => {
      await createUser('se7adm', 'globalAdmin', 'approved');
      await createUser('se7ny', 'player', 'pending');

      await assertSucceeds(updateDoc(
        doc(testEnv.authenticatedContext('se7adm').firestore(), 'users', 'se7ny'),
        { status: 'approved' },
      ));
    });

    it('en global admin KAN IKKE skrive point på nogen — heller ikke sig selv', async () => {
      await createUser('se7b', 'globalAdmin', 'approved');
      await createUser('se7off', 'player', 'approved');

      const fs = testEnv.authenticatedContext('se7b').firestore();
      await assertFails(updateDoc(doc(fs, 'users', 'se7b'), { totalPoints: 99999 }));
      // Bemærk: reglen måler på ÆNDRINGEN. At skrive den værdi, der allerede
      // står (0), er ikke en ændring og slipper igennem — derfor 1234 her.
      await assertFails(updateDoc(doc(fs, 'users', 'se7off'), { totalPoints: 1234 }));
      await assertFails(updateDoc(doc(fs, 'users', 'se7b'), { stagePoints: 500 }));
      await assertFails(updateDoc(doc(fs, 'users', 'se7b'), { bonusPoints: 500 }));
      await assertFails(updateDoc(doc(fs, 'users', 'se7b'), { previousRank: 1 }));
      await assertFails(updateDoc(doc(fs, 'users', 'se7b'), { seasons: { 2026: { totalPoints: 9999 } } }));
      await assertFails(updateDoc(doc(fs, 'users', 'se7b'), { points: 500 }));
    });
  });

  // --- Fund fra rollernes gennemgang: samme fejltype, andre steder ---------
  describe('users/{uid} — egen profil', () => {
    it('KAN rette sit visningsnavn (kontrol)', async () => {
      await createUser('se8', 'player', 'approved');
      await assertSucceeds(updateDoc(
        doc(testEnv.authenticatedContext('se8').firestore(), 'users', 'se8'),
        { displayName: 'Nyt navn' },
      ));
    });

    it('KAN IKKE skrive en andens uid på sin egen profil', async () => {
      await createUser('se8b', 'player', 'approved');
      // Ranglisten spreder dokumentet EFTER doc-id'et ({ uid: d.id, ...data }),
      // så feltet vinder over id'et.
      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('se8b').firestore(), 'users', 'se8b'),
        { uid: 'offer' },
      ));
    });

    it('KAN IKKE skrive points på sin egen profil', async () => {
      await createUser('se8c', 'player', 'approved');
      // create-reglen og admin-reglen blokerede begge 'points'; egen-profil-reglen gjorde ikke.
      await assertFails(updateDoc(
        doc(testEnv.authenticatedContext('se8c').firestore(), 'users', 'se8c'),
        { points: 9999 },
      ));
    });
  });

  describe('games/{g}/players/{uid} — update', () => {
    async function seedDeltager(uid, data) {
      await createUser(uid, 'player', 'approved');
      await createGame('se9-spil');
      await seed(`games/se9-spil/players/${uid}`, data);
    }
    const pDoc = (uid) => doc(
      testEnv.authenticatedContext(uid).firestore(), 'games', 'se9-spil', 'players', uid,
    );

    it('KAN gemme sit hold (kontrol)', async () => {
      await seedDeltager('se9', { uid: 'se9', joinedAt: Timestamp.now() });
      await assertSucceeds(updateDoc(pDoc('se9'), { favoriteTeam: 'AGF' }));
    });

    it('KAN IKKE skrive en andens uid på sit eget deltager-dokument', async () => {
      await seedDeltager('se9b', { uid: 'se9b', joinedAt: Timestamp.now() });
      // Stillingen, runde-placeringerne og opsamlingen læser alle uid-FELTET.
      await assertFails(updateDoc(pDoc('se9b'), { uid: 'offer' }));
    });

    it('KAN IKKE give sig selv et navn på deltager-dokumentet', async () => {
      await seedDeltager('se9c', { uid: 'se9c', joinedAt: Timestamp.now() });
      // Navnet slås op i users-profilen; her ville det vinde over opslaget.
      await assertFails(updateDoc(pDoc('se9c'), { name: 'Ejeren' }));
    });

    // FUNDET AF SECURITY REVIEWER: `perRound` er grundlaget for LIGAENS
    // stilling (fladen OG Runde-Botten regner af den), og feltet manglede på
    // denylisten. Et medlem kunne skrive { perRound: { '20': 1000000 } } og
    // toppe enhver liga med en startrunde — mens spil-stillingen så normal ud,
    // fordi totalPoints var urørt. Og fordi serveren merger perRound, ville en
    // bogus rundenøgle OVERLEVE næste genberegning.
    it('KAN IKKE skrive sit eget perRound (ligaens grundlag)', async () => {
      await seedDeltager('se9e', { uid: 'se9e', joinedAt: Timestamp.now() });
      await assertFails(updateDoc(pDoc('se9e'), { perRound: { 20: 1000000 } }));
      // …heller ikke sammen med en lovlig skrivning.
      await assertFails(updateDoc(pDoc('se9e'), { favoriteTeam: 'AGF', perRound: { 1: 5 } }));
    });

    it('KAN IKKE seede perRound ved tilmelding', async () => {
      await createUser('se9f', 'player', 'approved');
      await createGame('se9-spil');
      await assertFails(setDoc(
        doc(testEnv.authenticatedContext('se9f').firestore(), 'games', 'se9-spil', 'players', 'se9f'),
        { uid: 'se9f', joinedAt: Timestamp.now(), perRound: { 1: 999 } },
      ));
    });

    it('et deltager-dokument UDEN uid-felt kan stadig opdateres', async () => {
      // Pulje-afregningen kan danne { bonusPoints } med merge på en spiller
      // uden players-dokument. Krævede reglen feltet, kunne den spiller aldrig
      // gemme sit hold igen — og knappen ville bare holde op med at virke.
      await seedDeltager('se9d', { bonusPoints: 12 });
      await assertSucceeds(updateDoc(pDoc('se9d'), { favoriteTeam: 'AGF' }));
    });
  });

  describe('leagueBonusAnswers/{id} — leagueId bundet til spørgsmålet', () => {
    it('et medlem KAN IKKE sætte en FREMMED ligas id på sit eget svar', async () => {
      await createUser('se10', 'player', 'approved');
      await createLeague('se10-min', 'vaert', ['vaert', 'se10']);
      await createLeague('se10-anden', 'fremmed', ['fremmed']);
      await seed('leagueBonus/se-q10', {
        leagueId: 'se10-min', createdBy: 'vaert', type: 'text', label: 'Hvem?',
        facit: null, deadline: Timestamp.fromDate(iMorgen()),
      });

      // Læsereglen giver leagueId'ets manager adgang — et fremmed id inviterer
      // altså en fremmed manager ind i sit eget svar.
      await assertFails(setDoc(
        doc(testEnv.authenticatedContext('se10').firestore(), 'leagueBonusAnswers', 'se-q10_se10'),
        { questionId: 'se-q10', leagueId: 'se10-anden', uid: 'se10', answer: 'Messi' },
      ));
    });
  });
});

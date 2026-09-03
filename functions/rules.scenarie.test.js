// ---------------------------------------------------------------------------
// Invariant 4a: FLADEN TILBYDER ⇔ REGLERNE TILLADER — på det fælles Superliga-
// scenarie (src/test/scenarie/superliga.js), mod firestore.rules i emulatoren.
//
// Forlad-knappen fejlede i produktion for spillere med point, fordi fladen
// tilbød noget, reglerne forbød — og begge sider var testet hver for sig,
// grønt. Testene her kører SAMME skrivning, klienten sender, mod SAMME
// tilstand, fladen regner på, og kræver at de to svar er ens. Prædikaterne
// er fladens egne: isLocked (footballRounds.js:147) og medlemsgaten fra
// useGame.js:103 (`me != null && me.forladt !== true`), som er spejlet af
// reglernes erAktivDeltager().
//
// TIDEN: request.time i emulatoren er ægte og kan ikke fryses. Scenariets
// kickoffs forskydes derfor med (Date.now() − NU), så den relative struktur
// er 1:1 (den lånte kamp om 1 t, den igangværende 16 t siden) — samme greb
// som e2e/fixtures/seed-e2e.mjs.
//
// BRUGERNE ER GODKENDTE. Alle seedes med status 'approved' — også den nye:
// ProtectedRoute (src/components/ProtectedRoute.jsx:10) sender enhver
// ikke-godkendt til /afventer, så ingen pending-bruger ser Deltag-knappen.
// Invarianten gælder derfor kun godkendte, og det er den rigtige afgrænsning.
//
// KRÆVER emulator: firebase emulators:exec --only firestore "npm run test:rules"
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setDoc, doc, getDoc, updateDoc, deleteField, serverTimestamp, Timestamp, collection } from 'firebase/firestore';
import { scenarie, NU, FORLADT } from '../src/test/scenarie/superliga.js';
import { isLocked } from '../src/features/games/football/footballRounds.js';
import { SPILLER, MODSPILLER, FREMMED, EJER, SPIL_ID, LIGA_ID } from '../e2e/fixtures/konstanter.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(process.env.RULES_FILE || join(rootDir, 'firestore.rules'), 'utf8');

let testEnv;
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
afterAll(async () => { if (testEnv) await testEnv.cleanup(); });

const som = (uid) => testEnv.authenticatedContext(uid).firestore();
const betDoc = (uid, m) => doc(som(uid), 'games', SPIL_ID, 'bets', `${uid}_${m.id}`);
/** Fladens medlemsgate — useGame.js:103, spejlet af reglernes erAktivDeltager(). */
const fladenSerMedlem = (me) => me != null && me.forladt !== true;
/** Det, klienten faktisk sender (betActions.js setBet) — hverken points eller chance. */
const tipPayload = (uid, m, pick, leagueIds = []) => ({ uid, matchId: m.id, pick, leagueIds, updatedAt: serverTimestamp() });
/** Som setBet: setDoc med merge — så et eksisterende tip rettes i stedet for at blive erstattet (og miste points/chance-felterne). */
const skrivTip = (uid, m, pick, leagueIds = []) => setDoc(betDoc(uid, m), tipPayload(uid, m, pick, leagueIds), { merge: true });
const NY_BRUGER = 'helt-ny';

/** Seeder hele scenariet med reglerne slået fra. Returnerer scenariet med kickoffs forskudt til ægte tid. */
async function seedScenarie() {
  const S = scenarie();
  const forskyd = Date.now() - NU.getTime();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of [SPILLER.uid, MODSPILLER.uid, FREMMED.uid, FORLADT.uid, EJER.uid, NY_BRUGER]) {
      await db.collection('users').doc(uid).set({ displayName: uid, email: `${uid}@test.dk`, role: 'player', status: 'approved', createdAt: Timestamp.now() });
    }
    const spilDoc = { ...S.spil, createdAt: Timestamp.now() };
    delete spilDoc.eloHistory; // ikke en del af spil-dokumentet i reglernes øjne
    await db.collection('games').doc(SPIL_ID).set(spilDoc);
    for (const m of S.kampe) {
      await db.collection('games').doc(SPIL_ID).collection('matches').doc(m.id).set({
        home: m.home, away: m.away, round: m.round, odds: m.odds, result: m.result ?? null,
        kickoff: Timestamp.fromMillis(m.kickoff.getTime() + forskyd),
      });
    }
    for (const p of S.spillere) {
      const { forladtAt, ...rest } = p;
      await db.collection('games').doc(SPIL_ID).collection('players').doc(p.uid)
        .set({ ...rest, joinedAt: Timestamp.now(), ...(forladtAt ? { forladtAt: Timestamp.fromDate(forladtAt) } : {}) });
    }
    for (const l of S.ligaer) {
      const { id, ...rest } = l;
      await db.collection('games').doc(SPIL_ID).collection('leagues').doc(id).set({ ...rest, createdAt: Timestamp.now() });
    }
    for (const [matchId, bet] of Object.entries(S.tips)) {
      await db.collection('games').doc(SPIL_ID).collection('bets').doc(`${SPILLER.uid}_${matchId}`)
        .set({ uid: SPILLER.uid, matchId, pick: bet.pick, chanceStake: bet.chanceStake, points: bet.points, leagueIds: [LIGA_ID] });
    }
  });
  return S;
}

/** true hvis skrivningen lykkes, false hvis reglerne afviser — så begge sider kan sammenlignes som tal. */
async function tilladt(p) { try { await assertSucceeds(p); return true; } catch { return false; } }

describe('4a — fladen tilbyder ⇔ reglerne tillader', () => {
  beforeEach(async () => { await testEnv.clearFirestore(); });

  it('1X2: for HVER kamp i scenariet er «knappen er aktiv» og «tippet accepteres» det samme svar', async () => {
    const S = await seedScenarie();
    const nuMs = NU.getTime();
    const svar = [];
    for (const m of S.kampe) {
      const fladen = !isLocked(m, nuMs);
      // MODSPILLER har ingen tips i forvejen — så det er altid en oprettelse.
      const regler = await tilladt(skrivTip(MODSPILLER.uid, m, '1', [LIGA_ID]));
      svar.push({ id: m.id, fladen, regler });
    }
    for (const s of svar) expect(s.regler, `${s.id}: fladen=${s.fladen}, regler=${s.regler}`).toBe(s.fladen);
    // Ikke en tautologi: scenariet skal have BEGGE svar — ellers beviser ligheden intet.
    expect(svar.some((s) => s.fladen)).toBe(true);
    expect(svar.some((s) => !s.fladen)).toBe(true);
    // Og de navngivne kampe ligger, hvor scenariet siger.
    expect(svar.find((s) => s.id === S.noegle.laant.id).regler).toBe(true);
    expect(svar.find((s) => s.id === S.noegle.igang.id).regler).toBe(false);
  });

  it('1X2 ret et EKSISTERENDE tip: samme svar som knappen — den lånte kan rettes, runde 18 kan ikke', async () => {
    const S = await seedScenarie();
    const nuMs = NU.getTime();
    for (const m of [S.noegle.laant, S.noegle.aaben, ...S.noegle.afgjort]) {
      // Dokumentet SKAL findes, ellers er skrivningen en oprettelse, og testen
      // måler create-reglen i stedet for update-reglen (Security-fund). Egne
      // tips må altid læses.
      expect((await getDoc(betDoc(SPILLER.uid, m))).exists(), `${m.id} er seedet`).toBe(true);
      const fladen = !isLocked(m, nuMs);
      const regler = await tilladt(skrivTip(SPILLER.uid, m, '2', [LIGA_ID]));
      expect(regler, m.id).toBe(fladen);
    }
  });

  it('medlemsgaten: hele tip-fladen skjules for forladt og for en uden players-dokument — og reglerne afviser præcis dem (den fremmede i en anden liga er stadig medlem)', async () => {
    const S = await seedScenarie();
    const m = S.noegle.aaben; // ulåst — så det KUN er medlemskabet, der afgør svaret
    const tilfaelde = [
      { uid: SPILLER.uid, me: S.spillere.find((p) => p.uid === SPILLER.uid) },
      { uid: FREMMED.uid, me: S.spillere.find((p) => p.uid === FREMMED.uid) },
      { uid: FORLADT.uid, me: S.spillere.find((p) => p.uid === FORLADT.uid) },
      { uid: NY_BRUGER, me: null },
    ];
    for (const t of tilfaelde) {
      const fladen = fladenSerMedlem(t.me);
      const tip = await tilladt(skrivTip(t.uid, m, 'X'));
      const liga = await tilladt(setDoc(doc(collection(som(t.uid), 'games', SPIL_ID, 'leagues')),
        { name: 'Ny liga', ownerUid: t.uid, memberUids: [t.uid], code: 'NYLIGA', createdAt: serverTimestamp() }));
      expect(tip, `${t.uid} tip`).toBe(fladen);
      expect(liga, `${t.uid} liga`).toBe(fladen);
    }
    expect(tilfaelde.filter((t) => fladenSerMedlem(t.me))).toHaveLength(2);
  });

  it('spiloversigten: «Vend tilbage» (forladt) og «Deltag» (ny) er præcis de skrivninger, reglerne tillader — og «Forlad» går ALDRIG udenom serveren', async () => {
    await seedScenarie();
    // Forladt: fladen tilbyder Vend tilbage (myForladt) → joinGame's update-gren.
    await assertSucceeds(updateDoc(doc(som(FORLADT.uid), 'games', SPIL_ID, 'players', FORLADT.uid),
      { forladt: deleteField(), forladtAt: deleteField(), joinedAt: serverTimestamp() }));
    // Ny: fladen tilbyder Deltag → joinGame's create-gren.
    await assertSucceeds(setDoc(doc(som(NY_BRUGER), 'games', SPIL_ID, 'players', NY_BRUGER), { uid: NY_BRUGER, joinedAt: serverTimestamp() }));
    // Medlem: fladen tilbyder Forlad — men KUN gennem callable'en forladSpil. Klienten kan ikke selv sætte flaget
    // (så kunne den forlade uden at slette tips), og kan ikke slette sit dokument, når der er point.
    await assertFails(updateDoc(doc(som(SPILLER.uid), 'games', SPIL_ID, 'players', SPILLER.uid), { forladt: true }));
    await assertFails(setDoc(doc(som(SPILLER.uid), 'games', SPIL_ID, 'players', SPILLER.uid), { uid: SPILLER.uid, forladt: true }, { merge: true }));
  });

  it('chancen: fladen tilbyder ⚡ på den lånte kamp — men aldrig som en direkte skrivning; reglerne afviser feltet uanset', async () => {
    const S = await seedScenarie();
    // Fladen tilbyder ⚡ kun for tippede, ulåste kampe (FootballTip.jsx:1103) — den lånte er sådan én.
    expect(!isLocked(S.noegle.laant, NU.getTime()) && S.tips[S.noegle.laant.id]?.pick).toBeTruthy();
    // …og alligevel: en direkte skrivning af chanceStake afvises. Kun callable'en setGameChance må.
    expect((await getDoc(betDoc(SPILLER.uid, S.noegle.laant))).exists()).toBe(true);
    await assertFails(updateDoc(betDoc(SPILLER.uid, S.noegle.laant), { chanceStake: 3 }));
    // Kontrol på SAMME dokument og samme update-gren: uden chance-feltet går rettelsen igennem,
    // så det er writingChanceFields-vagten, der afviser — ikke kickoff, medlemskab eller ligaer.
    await assertSucceeds(skrivTip(SPILLER.uid, S.noegle.laant, '2', [LIGA_ID]));
    await assertFails(setDoc(betDoc(MODSPILLER.uid, S.noegle.aaben), { ...tipPayload(MODSPILLER.uid, S.noegle.aaben, '1'), chanceStake: 1 }));
    // Kontrol: samme skrivning uden chance-feltet går igennem — så det er FELTET, der afvises, ikke tippet.
    await assertSucceeds(skrivTip(MODSPILLER.uid, S.noegle.aaben, '1'));
  });
});

// ---------------------------------------------------------------------------
// Ét fælles, ROGET Superliga-scenarie til Vitest — det, tip-fladens og
// spiloversigtens tests kører på, og som invariant-testene bygger videre på.
//
// HVORFOR ÉT SCENARIE OG IKKE TI SMÅ: "Næste kamp låser om" ignorerede
// udsatte kampe i månedsvis, fordi ingen fixture havde en efterslæber — hver
// test byggede sin egen, pæne runde, hvor alle kampe var i samme tilstand.
// Et fixture, hvor alle rækker er i samme tilstand, kan ikke fange en fjernet
// gate (Test Managers mønster). Dette scenarie bærer derfor BEGGE tilstande
// af hver gate på én gang: låste og ulåste kampe i samme runde, en lånt kamp
// fra en tidligere runde, der låser FØR rundens egne, en afgjort runde med
// tips (facit-blokken), en runde før startRound (skjules), en liga hvor jeg
// er med og en hvor jeg ikke er, spillere med point og en forladt spiller.
//
// DELER KONSTANTER MED E2E (e2e/fixtures/konstanter.mjs): samme hold, samme
// rundenumre (19 låst, 20 åben), samme spiller-id'er og point, og samme
// kamp-id'er via buildMatches — så en E2E-spec og en Vitest-test taler om
// den samme kamp. Forskellen er formen: Vitest bruger Date og en frossen
// systemtid (NU); emulatoren bruger Timestamp relativt til seed-tiden.
//
// Alt er FABRIK, ikke frosne objekter: hvert kald giver friske objekter, og
// `overrides` lader en test vippe én gate uden at kopiere hele scenariet.
// ---------------------------------------------------------------------------
import { buildMatches } from '../../lib/superligaSeed.js';
import {
  HOLD, SPIL_ID, SPIL_NAVN, LIGA_ID, LIGA_NAVN, FREMMED_LIGA_ID,
  SPILLER, MODSPILLER, FREMMED, EJER, POINT, AABEN_RUNDE, LAAST_RUNDE,
} from '../../../e2e/fixtures/konstanter.mjs';

const [ALFA, BETA, GAMMA, DELTA] = HOLD.map((h) => h.name);

/** Frossen "nu": torsdag 3. september 2026 kl. 10:00 UTC. Ugen løber tirsdag→mandag (1.–7. sep.). */
export const NU = new Date('2026-09-03T10:00:00Z');
const T = 60 * 60 * 1000;
const D = 24 * T;
const dato = (iso) => new Date(iso);

/** Den forladte spiller — findes i players med point og forladt: true, men er ikke medlem. */
export const FORLADT = { uid: 'e2e-forladt', displayName: 'E2E Forladt' };

export const FOER_START = 17;   // runde før startRound — skal skjules
export const AFGJORT_RUNDE = 18; // helt afgjort, med mine tips → facit-blokken
export const START_RUNDE = 18;
export const FREMTIDIG_RUNDE = 21;

/** Kampene, som fixtures (uden odds/elo) — buildMatches giver id, odds og Elo-snapshot. */
function fixtures() {
  return [
    // Runde 17: før startRound. Afgjort.
    { round: FOER_START, home: ALFA, away: BETA, kickoff: dato('2026-08-01T16:00:00Z'), result: '1', homeGoals: 2, awayGoals: 0 },
    { round: FOER_START, home: GAMMA, away: DELTA, kickoff: dato('2026-08-02T14:00:00Z'), result: 'X', homeGoals: 1, awayGoals: 1 },
    // Runde 18: helt afgjort — jeg har tippet begge (ét rigtigt).
    { round: AFGJORT_RUNDE, home: ALFA, away: GAMMA, kickoff: dato('2026-08-22T16:00:00Z'), result: '1', homeGoals: 3, awayGoals: 1 },
    { round: AFGJORT_RUNDE, home: BETA, away: DELTA, kickoff: dato('2026-08-23T14:00:00Z'), result: '2', homeGoals: 0, awayGoals: 1 },
    // Runde 19 (LAAST_RUNDE): to spillede — og én UDSAT til denne uge, som
    // låser om præcis 1 time: den lånte kamp, der låser FØR runde 20's egne
    // (tælleren siger "om 1 t", og under 2 t lyser den).
    { round: LAAST_RUNDE, home: DELTA, away: ALFA, kickoff: dato('2026-08-29T16:00:00Z'), result: '2', homeGoals: 0, awayGoals: 2 },
    { round: LAAST_RUNDE, home: GAMMA, away: BETA, kickoff: dato('2026-08-30T14:00:00Z'), result: 'X', homeGoals: 2, awayGoals: 2 },
    { round: LAAST_RUNDE, home: BETA, away: ALFA, kickoff: new Date(NU.getTime() + 1 * T), result: null },
    // Runde 20 (AABEN_RUNDE): én kamp er gået i gang (låst, intet facit endnu),
    // én er stadig åben — begge tilstande i SAMME runde.
    { round: AABEN_RUNDE, home: ALFA, away: DELTA, kickoff: new Date(NU.getTime() - 16 * T), result: null, live: { home: 1, away: 0, status: 'anden halvleg', at: NU.getTime() - 16 * T } },
    { round: AABEN_RUNDE, home: GAMMA, away: ALFA, kickoff: new Date(NU.getTime() + 2 * D + 6 * T), result: null },
    // Runde 21: fremtidig, uden tips.
    { round: FREMTIDIG_RUNDE, home: DELTA, away: GAMMA, kickoff: dato('2026-09-12T16:00:00Z'), result: null },
    { round: FREMTIDIG_RUNDE, home: BETA, away: ALFA, kickoff: dato('2026-09-13T14:00:00Z'), result: null },
  ];
}

/** Kampene med id, odds og Elo — id'erne er de samme som i emulatoren (matchId). */
export function kampe() {
  const fx = fixtures();
  const byggede = buildMatches(fx, HOLD);
  // buildMatch tager kun id/round/home/away/kickoff — resultat og live lægges på igen.
  return byggede.map((m, i) => ({ ...m, result: fx[i].result ?? null, ...(fx[i].homeGoals != null ? { homeGoals: fx[i].homeGoals, awayGoals: fx[i].awayGoals } : {}), ...(fx[i].live ? { live: fx[i].live } : {}) }));
}

/** Navngivne opslag — så en test kan sige "den lånte kamp" uden at kende id-formatet. */
export function noegleKampe(liste = kampe()) {
  const find = (round, home) => liste.find((m) => m.round === round && m.home === home);
  return {
    laant: find(LAAST_RUNDE, BETA),          // r19, udsat til denne uge, ulåst, låser først
    igang: find(AABEN_RUNDE, ALFA),          // r20, låst (kickoff i går), live
    aaben: find(AABEN_RUNDE, GAMMA),         // r20, ulåst, om 2 dage
    afgjort: liste.filter((m) => m.round === AFGJORT_RUNDE),
    foerStart: liste.filter((m) => m.round === FOER_START),
    fremtidige: liste.filter((m) => m.round === FREMTIDIG_RUNDE),
  };
}

/** Mine tips, som useGameBets leverer dem: { [matchId]: { pick, chanceStake, points } }. */
export function mineTips(liste = kampe()) {
  const k = noegleKampe(liste);
  const [a18, b18] = k.afgjort;
  return {
    [k.foerStart[0].id]: { pick: '1', chanceStake: 0, points: 1 },
    [a18.id]: { pick: '1', chanceStake: 0, points: 1 },   // rigtigt
    [b18.id]: { pick: '1', chanceStake: 0, points: 0 },   // forkert (facit 2)
    [k.laant.id]: { pick: 'X', chanceStake: 1, points: 0 }, // chancen på den LÅNTE kamp
    [k.aaben.id]: { pick: '2', chanceStake: 0, points: 0 }, // tippet, ulåst
    // igang: IKKE tippet — låst uden tip er sin egen tilstand
  };
}

/** Spillets dokument, som GamePage/useGame leverer det. */
export function spil(overrides = {}) {
  return {
    id: SPIL_ID, name: SPIL_NAVN, shortName: 'E2E', emoji: '⚽', type: 'football',
    status: 'open', joinable: true, season: '2026-27', order: 99,
    teams: HOLD.map((h) => ({ ...h })),
    startRound: START_RUNDE,
    eloHistory: [
      { round: FOER_START, elo: Object.fromEntries(HOLD.map((h) => [h.name, h.elo])) },
      { round: AFGJORT_RUNDE, elo: Object.fromEntries(HOLD.map((h) => [h.name, h.elo + 5])) },
    ],
    ...overrides,
  };
}

/** Spillerne i players-samlingen — inkl. den forladte, som stadig har point. */
export function spillere() {
  return [
    { uid: SPILLER.uid, displayName: SPILLER.displayName, totalPoints: POINT[SPILLER.uid], leagueIds: [LIGA_ID] },
    { uid: MODSPILLER.uid, displayName: MODSPILLER.displayName, totalPoints: POINT[MODSPILLER.uid], leagueIds: [LIGA_ID] },
    { uid: FREMMED.uid, displayName: FREMMED.displayName, totalPoints: POINT[FREMMED.uid], leagueIds: [FREMMED_LIGA_ID] },
    { uid: FORLADT.uid, displayName: FORLADT.displayName, totalPoints: 3, leagueIds: [], forladt: true, forladtAt: dato('2026-08-31T12:00:00Z') },
  ];
}

/** Mig — SPILLER — som `me`-proppen (players-dokumentet). */
export function mig(overrides = {}) {
  return { ...spillere()[0], ...overrides };
}

/** Ligaerne: én, jeg er med i, og én, jeg ikke er. */
export function ligaer() {
  return [
    { id: LIGA_ID, name: LIGA_NAVN, ownerUid: EJER.uid, memberUids: [SPILLER.uid, MODSPILLER.uid], code: 'E2E1' },
    { id: FREMMED_LIGA_ID, name: 'De fremmede', ownerUid: FREMMED.uid, memberUids: [FREMMED.uid], code: 'E2E2' },
  ];
}

/** Hele scenariet på én gang. `overrides.spil` og `overrides.nu` er de to knapper, tests drejer på. */
export function scenarie(overrides = {}) {
  const liste = kampe();
  return {
    nu: overrides.nu ?? NU,
    spil: spil(overrides.spil),
    mig: mig(overrides.mig),
    kampe: liste,
    noegle: noegleKampe(liste),
    tips: mineTips(liste),
    spillere: spillere(),
    ligaer: ligaer(),
  };
}

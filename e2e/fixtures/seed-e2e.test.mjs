// Vagten om emulator-værten skal kunne gøres rød uden at starte en emulator.
import { describe, it, expect } from 'vitest';
import { erLokalVaert, kampPlan } from './seed-e2e.mjs';
import { ugeNoegle, buildRoundContext } from '../../src/lib/pointOpdeling.js';
import { groupByRound, efterslaebPaaRunde } from '../../src/features/games/football/footballRounds.js';
import { AABEN_RUNDE, LAAST_RUNDE, UDSAT_RUNDE } from './konstanter.mjs';

describe('seed-e2e: kun lokale emulator-værter', () => {
  it.each(['localhost:8080', '127.0.0.1:9099', '[::1]:8080'])('tillader %s', (h) => {
    expect(erLokalVaert(h)).toBe(true);
  });
  it.each(['example.invalid:1', 'firestore.googleapis.com:443', '10.0.0.5:8080', '', undefined])('afviser %s', (h) => {
    expect(erLokalVaert(h)).toBe(false);
  });
});

describe('seed-e2e: vagterne sidder FØR første netværkskald', () => {
  // Rejektionen skal komme fra vagten, ikke fra en timeout mod en vært, der
  // ikke svarer — ellers ville en fjernet vagt først vise sig som 30 s ventetid.
  const gem = { ...process.env };
  const gendan = () => { for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) { if (gem[k] === undefined) delete process.env[k]; else process.env[k] = gem[k]; } };

  it('afviser en fremmed Firestore-vært med det samme', async () => {
    const { default: seed } = await import('./seed-e2e.mjs');
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.FIRESTORE_EMULATOR_HOST = 'example.invalid:1';
    try {
      await expect(seed()).rejects.toThrow(/FIRESTORE_EMULATOR_HOST=example\.invalid:1 er ikke en lokal vært/);
    } finally { gendan(); }
  });

  it('afviser at køre med GOOGLE_APPLICATION_CREDENTIALS sat', async () => {
    const { default: seed } = await import('./seed-e2e.mjs');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/ingen/saadan/fil.json';
    try {
      await expect(seed()).rejects.toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    } finally { gendan(); }
  });
});

// ---------------------------------------------------------------------------
// Fixturet skal give den SAMME flade uanset hvilken time i ugen, seedet kører.
// Regnet med fladens egne funktioner (groupByRound + efterslaebPaaRunde er
// dem, FootballTip.jsx tegner rundens kort af), ikke en kopi af reglen.
// ---------------------------------------------------------------------------
const TIME = 3600e3;
const DAG = 24 * TIME;

/**
 * Hvad en runde viser: egne kort + lånte (efterslæbere fra andre runder) — og
 * hvor mange af de egne, der står PÅ KUPONEN (`iVindue` fra buildRoundContext,
 * samme kilde som FootballTip). Test Manager: uden kupon-tallet overlevede
 * «runde 20's anden kamp om 27 timer» — den krydser ugeskellet mandag og
 * bliver «udenfor», hvilket laant.spec.js:17 forbyder.
 */
function kortPaa(plan, runde) {
  const medId = plan.map((k) => ({ ...k, id: `r${k.round}-${k.home}-${k.away}` }));
  const rounds = groupByRound(medId);
  const egne = (rounds.find((r) => r.round === runde) || { matches: [] }).matches;
  const laante = efterslaebPaaRunde(rounds, runde).map((e) => e.fraRunde);
  const { byMatch } = buildRoundContext(medId);
  const paaKupon = egne.filter((m) => byMatch[m.id].iVindue).length;
  return { egne: egne.length, laante, paaKupon };
}

/** Alle 168 timer i ugen fra et mandags-midnat (UTC). */
const timerFra = (startIso) => Array.from({ length: 168 }, (_, h) => Date.parse(startIso) + h * TIME);

describe('kampPlan — samme flade i alle ugens timer', () => {
  // To uger: en almindelig i september og den, hvor sommertiden slutter (25/10 2026).
  const uger = [timerFra('2026-09-21T00:00:00Z'), timerFra('2026-10-19T00:00:00Z')];

  it.each(uger.map((u, i) => [i === 0 ? 'september' : 'omkring sommertidsskiftet', u]))(
    'runde 20 viser 2 egne + den lånte, runde 19 viser 2 og låner intet — %s',
    (_, timer) => {
      const restvindue = [];
      for (const nu of timer) {
        const plan = kampPlan(nu);
        const r20 = kortPaa(plan, AABEN_RUNDE);
        const r19 = kortPaa(plan, LAAST_RUNDE);
        const r18 = kortPaa(plan, UDSAT_RUNDE);
        expect(r20.egne, `runde 20 egne @${new Date(nu).toISOString()}`).toBe(2);
        expect(r19.egne, `runde 19 egne @${new Date(nu).toISOString()}`).toBe(2);
        expect(r19.laante, `runde 19 låner @${new Date(nu).toISOString()}`).toEqual([]);
        expect(r18.egne).toBe(3);
        // Alle egne kampe i runde 19 og 20 står på kuponen — ingen «udenfor»;
        // i runde 18 er det netop den udsatte, der står udenfor (2 af 3).
        expect(r20.paaKupon, `runde 20 på kuponen @${new Date(nu).toISOString()}`).toBe(2);
        expect(r19.paaKupon, `runde 19 på kuponen @${new Date(nu).toISOString()}`).toBe(2);
        expect(r18.paaKupon, `runde 18 på kuponen @${new Date(nu).toISOString()}`).toBe(2);
        // Det dokumenterede restvindue: ugeskellet mellem den udsatte (+1½ t) og runde 20 (+3 t).
        if (ugeNoegle(nu + 1.5 * TIME) !== ugeNoegle(nu + 3 * TIME)) { restvindue.push(nu); continue; }
        expect(r20.laante, `runde 20 låner @${new Date(nu).toISOString()}`).toEqual([UDSAT_RUNDE]);
      }
      // Højst to hele timer (1½ times vindue), og de ligger tirsdag kl. 01–02
      // dansk tid — ikke mandag formiddag, hvor rapporten kører.
      expect(restvindue.length).toBeLessThanOrEqual(2);
      expect(restvindue.length).toBeGreaterThan(0); // vinduet findes: forsvinder det, er reglen ændret
      for (const nu of restvindue) {
        const dk = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', weekday: 'short', hour: '2-digit', hour12: false }).format(nu);
        expect(dk, `restvindue @${new Date(nu).toISOString()}`).toMatch(/^Tue,? 0[12]$/);
      }
    },
  );

  it('den GAMLE plan (nu−6 og nu−13 dage) gav 4 kort på runde 20 og et lån på runde 19 en mandag formiddag', () => {
    // Båndet bliver rødt af den gamle værdi: det er præcis den røde ugentlige
    // rapport (7/9 og 14/9 2026), regnet frem i stedet for observeret.
    const gammel = (nu) => [
      { round: UDSAT_RUNDE, home: 'A', away: 'D', kickoff: nu - 14 * DAG },
      { round: UDSAT_RUNDE, home: 'B', away: 'G', kickoff: nu - 13 * DAG },
      { round: UDSAT_RUNDE, home: 'D', away: 'B', kickoff: nu + 1.5 * TIME },
      { round: LAAST_RUNDE, home: 'A', away: 'B', kickoff: nu - 7 * DAG },
      { round: LAAST_RUNDE, home: 'G', away: 'D', kickoff: nu - 6 * DAG },
      { round: AABEN_RUNDE, home: 'A', away: 'G', kickoff: nu + 3 * TIME },
      { round: AABEN_RUNDE, home: 'B', away: 'D', kickoff: nu + 27 * TIME },
    ];
    const mandag = Date.parse('2026-09-14T08:09:41Z'); // kørslen 14/9, 10.09 dansk tid
    // +27 t fra mandag 10.09 er tirsdag 13.09 — næste uge — så runde 20's egen anden kamp står udenfor kuponen.
    expect(kortPaa(gammel(mandag), AABEN_RUNDE)).toEqual({ egne: 2, laante: [UDSAT_RUNDE, LAAST_RUNDE], paaKupon: 1 });
    expect(kortPaa(gammel(mandag), LAAST_RUNDE).laante).toEqual([UDSAT_RUNDE]);
    // Og den nye plan, samme øjeblik: som alle andre timer.
    expect(kortPaa(kampPlan(mandag), AABEN_RUNDE)).toEqual({ egne: 2, laante: [UDSAT_RUNDE], paaKupon: 2 });
    expect(kortPaa(kampPlan(mandag), LAAST_RUNDE).laante).toEqual([]);
  });

  it('den udsatte låser FØR runde 20\'s egne, og alle syv kampe er der', () => {
    const nu = Date.parse('2026-09-18T10:00:00Z');
    const plan = kampPlan(nu);
    expect(plan).toHaveLength(7);
    const udsat = plan.find((k) => k.round === UDSAT_RUNDE && k.kickoff > nu);
    for (const k of plan.filter((k) => k.round === AABEN_RUNDE)) expect(k.kickoff).toBeGreaterThan(udsat.kickoff);
  });
});

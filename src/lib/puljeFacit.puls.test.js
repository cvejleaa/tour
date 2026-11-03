// «STADIG MED»-PULSEN (puljeFacit.stadigMed/pulsFor, planens P1).
//
// Testene kører mod den RIGTIGE kalender (scripts/games.mjs) og de rigtige
// hold — testkalenderen (src/test/faseKalender.js) har 48 hovedrundekampe
// fra dag 7; produktionen har 36 fra dag 8, og det er dét tal, der afgør,
// hvornår hovedrunden er hel.
import { describe, it, expect } from 'vitest';
import {
  stadigMed, pulsFor, faseHold, rundeFacit, puljeKanAfregnes, facitFase,
} from './puljeFacit';
import { puljeKonfig } from './superligaScoring';
import { faseFor } from './faser';
import { GAMES } from '../../scripts/games.mjs';
import { HAANDBOLD_VM2027_HOLD } from '../data/haandboldVm2027Hold';
import program from '../../scripts/haandbold-vm2027-program.json';

export const HVM27 = Object.freeze({
  ...GAMES.find((g) => g.id === 'hvm2027'), id: 'hvm2027', teams: HAANDBOLD_VM2027_HOLD,
});

export const INDLEDENDE = program.fixtures.map((f) => ({
  id: f.id, round: f.round, home: f.home, away: f.away, kickoff: Date.parse(f.kickoff),
}));

// Hovedrunden: fire grupper à seks hold, hver gruppe «tre mod tre» = 9 kampe,
// hvert hold 3 gange. 4 × 9 = 36, fordelt på dag 8-13.
export const HOVED_GRUPPER = [
  [['Danmark', 'Norge', 'Sverige'], ['Island', 'Kroatien', 'Slovenien']],
  [['Frankrig', 'Spanien', 'Portugal'], ['Tyskland', 'Egypten', 'Brasilien']],
  [['Ungarn?', 'Serbien', 'Nordmakedonien'], ['Argentina', 'Italien', 'Færøerne']],
  [['Polen', 'Tunesien', 'Japan'], ['Chile', 'Qatar', 'Bahrain']],
].map(([a, b]) => [a.map((h) => (h === 'Ungarn?' ? 'USA' : h)), b]);
export const HOVED = HOVED_GRUPPER.flatMap(([a, b], g) => a.flatMap((h, i) => b.map((u, j) => ({
  id: `r${8 + ((i * 3 + j + g) % 6)}-hr-${g}-${i}-${j}`, round: 8 + ((i * 3 + j + g) % 6), home: h, away: u, kickoff: 1,
}))));
export const KVART = [
  { id: 'r14-a', round: 14, home: 'Danmark', away: 'Spanien', kickoff: 1, result: '1', homeGoals: 31, awayGoals: 30 },
  { id: 'r14-b', round: 14, home: 'Island', away: 'Tyskland', kickoff: 1, result: '2', homeGoals: 28, awayGoals: 30 },
  { id: 'r15-a', round: 15, home: 'Frankrig', away: 'Norge', kickoff: 1, result: '1', homeGoals: 30, awayGoals: 29 },
  { id: 'r15-b', round: 15, home: 'Kroatien', away: 'Portugal', kickoff: 1, result: '1', homeGoals: 27, awayGoals: 25 },
];
export const SEMI = [
  { id: 'r16-a', round: 16, home: 'Danmark', away: 'Tyskland', kickoff: 1 },
  { id: 'r16-b', round: 16, home: 'Frankrig', away: 'Kroatien', kickoff: 1 },
];
const FINALE = [
  { id: 'r17-a', round: 17, home: 'Tyskland', away: 'Kroatien', kickoff: 1 },
  { id: 'r17-b', round: 17, home: 'Danmark', away: 'Frankrig', kickoff: 1 },
];

const navne = (puls) => [...puls.hold].sort();

describe('fixturen er den rigtige turnering', () => {
  it('36 hovedrundekampe, 24 hold, hvert 3 gange — og alle 24 spillede den indledende runde', () => {
    expect(HOVED).toHaveLength(36);
    const tal = new Map();
    for (const m of HOVED) for (const h of [m.home, m.away]) tal.set(h, (tal.get(h) || 0) + 1);
    expect(tal.size).toBe(24);
    expect([...tal.values()].every((n) => n === 3)).toBe(true);
    const indledende = new Set(INDLEDENDE.flatMap((m) => [m.home, m.away]));
    expect([...tal.keys()].every((h) => indledende.has(h))).toBe(true);
    expect(new Set(HOVED.map((m) => m.round))).toEqual(new Set([8, 9, 10, 11, 12, 13]));
  });
});

describe('stadigMed — reglen', () => {
  it('de faser, der tæller, er PRÆCIS indledende runde → semifinaler (finaledagen tæller aldrig)', () => {
    const tæller = HVM27.faser.filter((f) => f.fra <= facitFase(HVM27, 'Semifinaler').fra).map((f) => f.navn);
    expect(tæller).toEqual(['Indledende runde', 'Hovedrunde', 'Kvartfinaler', 'Semifinaler']);
    // Hele turneringen lagt ind: pulsen står på semifinalerne.
    const p = stadigMed(HVM27, [...INDLEDENDE, ...HOVED, ...KVART, ...SEMI, ...FINALE]);
    expect(p.fase).toEqual({ navn: 'Semifinaler', bestemt: 'Semifinalerne', fra: 16 });
  });

  it('kun den indledende runde: alle 32 er med', () => {
    const p = stadigMed(HVM27, INDLEDENDE);
    expect(p.hold.size).toBe(32);
    expect(p.fase.navn).toBe('Indledende runde');
    expect(p.fejl).toBeNull();
  });

  // Hovedrunden 35, 36 og 37: kun 36 udskiller. Et bånd, der rummer 35 og 37,
  // ville gøre pulsen tavst forkert.
  it('hovedrunden med 35, 36 og 37 kampe: KUN 36 udskiller hold', () => {
    expect(stadigMed(HVM27, [...INDLEDENDE, ...HOVED.slice(0, 35)]).hold.size).toBe(32);
    const hel = stadigMed(HVM27, [...INDLEDENDE, ...HOVED]);
    expect(hel.hold.size).toBe(24);
    expect(hel.fase.navn).toBe('Hovedrunde');
    expect(hel.hold.has('USA')).toBe(true);
    expect(hel.hold.has('Uruguay')).toBe(false);
    const ekstra = { id: 'r13-x', round: 13, home: 'Danmark', away: 'Island', kickoff: 1 };
    expect(stadigMed(HVM27, [...INDLEDENDE, ...HOVED, ekstra]).hold.size).toBe(32);
  });

  // NY FRAVÆRS-ASSERTION: når bronzen og finalen lægges ind, er
  // semifinaletaberne IKKE ude.
  it('finaledagen lagt ind: semifinaletaberne er stadig med', () => {
    const p = stadigMed(HVM27, [...INDLEDENDE, ...HOVED, ...KVART, ...SEMI, ...FINALE]);
    expect(navne(p)).toEqual(['Danmark', 'Frankrig', 'Kroatien', 'Tyskland']);
  });

  it('et hold i hovedrunden, der ikke var med i den indledende runde: fejl — og holdene står som før', () => {
    const fremmed = HOVED.map((m, i) => (i === 0 ? { ...m, home: 'Grønland' } : m));
    const p = stadigMed({ ...HVM27, teams: [...HAANDBOLD_VM2027_HOLD, { name: 'Grønland', short: 'GRL', elo: 900 }] }, [...INDLEDENDE, ...fremmed]);
    // Grønland står én gang og Danmark to — det er fordelingen, der fanger det,
    // før delmængde-tjekket når så langt.
    expect(p.fejl).toMatch(/står ikke lige mange gange \(Grønland 1, Danmark 2 — forventet 3\)/);
    // Grønland var aldrig i den indledende runde: den hele fase skar det fra.
    expect(p.hold.size).toBe(32);
    expect(p.hold.has('Grønland')).toBe(false);
    expect(p.fase.navn).toBe('Indledende runde');
  });

  it('delmængde-vagten: en hel, ensartet hovedrunde med et hold, der ikke var med, giver fejl', () => {
    // USA byttes HELT ud (alle tre kampe) med et hold, der aldrig var med.
    // Fordelingen er ens (3 × 24), så kun delmængde-tjekket kan fange det.
    const ombyttet = HOVED.map((m) => ({ ...m, home: m.home === 'USA' ? 'Atlantis' : m.home, away: m.away === 'USA' ? 'Atlantis' : m.away }));
    const p = stadigMed(HVM27, [...INDLEDENDE, ...ombyttet]);
    expect(p.fejl).toBe('Atlantis står i «Hovedrunde», men var ikke med i «Indledende runde»');
    expect(p.hold.size).toBe(32);
  });

  // QC B1: Y (levende) står som X, der OGSÅ er med. Mængden er stadig en
  // delmængde — men fordelingen er skæv, og så er fasen IKKE hel. Y må ikke
  // streges over.
  it('FORBYTNING (QC B1): Sverige står som Norge i én hovedrundekamp — Sverige streges IKKE over', () => {
    const i = HOVED.findIndex((m) => m.home === 'Sverige');
    const forbyttet = HOVED.map((m, j) => (j === i ? { ...m, home: 'Norge' } : m));
    const p = stadigMed(HVM27, [...INDLEDENDE, ...forbyttet]);
    expect(p.hold.has('Sverige')).toBe(true);
    expect(p.fase.navn).toBe('Indledende runde');
    expect(p.fejl).toBe('«Hovedrunde» har 36 kampe, men holdene står ikke lige mange gange (Norge 4, Sverige 2 — forventet 3)');
  });

  it('knockout: et hold to gange i kvartfinalerne er ikke en hel fase', () => {
    const dobbelt = KVART.map((m, i) => (i === 1 ? { ...m, home: 'Danmark' } : m));
    const p = stadigMed(HVM27, [...INDLEDENDE, ...HOVED, ...dobbelt]);
    expect(p.fase.navn).toBe('Hovedrunde');
    expect(p.fejl).toMatch(/«Kvartfinaler» har 4 kampe, men holdene står ikke lige mange gange \(Danmark 2 — forventet 1\)/);
  });

  // Monotoni: kampene oprettes én ad gangen i kronologisk rækkefølge. Holdene
  // skrumper aldrig ind og er altid en delmængde af forrige skridt.
  it('KUN FALDENDE: oprettet én kamp ad gangen vokser holdene aldrig', () => {
    const efter = [...HOVED, ...KVART, ...SEMI, ...FINALE];
    let forrige = stadigMed(HVM27, INDLEDENDE).hold;
    const liste = [...INDLEDENDE];
    for (const m of efter) {
      liste.push(m);
      const nu = stadigMed(HVM27, liste).hold;
      expect(nu.size).toBeLessThanOrEqual(forrige.size);
      expect([...nu].every((h) => forrige.has(h))).toBe(true);
      forrige = nu;
    }
    expect(forrige.size).toBe(4);
  });

  // Bindingen til afgørelsen: når puljen kan afgøres, er pulsen PRÆCIS facit.
  it('når puljen kan afgøres, er stadigMed præcis rundeFacit', () => {
    const alle = [...INDLEDENDE, ...HOVED, ...KVART, ...SEMI];
    const k = puljeKonfig(HVM27);
    expect(puljeKanAfregnes(k, HVM27, alle)).toBe(true);
    expect(stadigMed(HVM27, alle).hold).toEqual(new Set(rundeFacit(k, HVM27, alle)));
  });

  it('tilRunde: hel hovedrunde (fra dag 8) — 7 giver 32, 8 giver 24', () => {
    const alle = [...INDLEDENDE, ...HOVED];
    expect(stadigMed(HVM27, alle, { tilRunde: 7 }).hold.size).toBe(32);
    expect(stadigMed(HVM27, alle, { tilRunde: 8 }).hold.size).toBe(24);
    expect(faseFor(HVM27, 8).navn).toBe('Hovedrunde');
  });

  it('null for en liga-pulje, et spil uden pulje og en konfigurationsfejl', () => {
    expect(stadigMed({ id: 'sl', pulje: { poolSize: 6 }, teams: [] }, [])).toBeNull();
    expect(stadigMed({ id: 'pl', pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe' } }, [])).toBeNull();
    expect(stadigMed({ ...HVM27, pulje: undefined }, INDLEDENDE)).toBeNull();
    expect(stadigMed({ ...HVM27, pulje: { ...HVM27.pulje, facitFase: 'Ottendedele' } }, INDLEDENDE)).toBeNull();
    expect(stadigMed({ ...HVM27, pulje: { ...HVM27.pulje, poolSize: 6 } }, INDLEDENDE)).toBeNull();
  });

  // Knockout (DATA: fasens knockout-flag) kræver hvert hold PRÆCIS én gang —
  // også når fordelingen er ens: fire hold, der hver står to gange, er ikke
  // fire kvartfinaler.
  it('knockout: fire hold to gange hver er ikke en hel kvartfinalerunde — i en gruppefase ville det være', () => {
    const toGange = [
      { id: 'a', round: 14, home: 'Danmark', away: 'Norge' }, { id: 'b', round: 14, home: 'Island', away: 'Kroatien' },
      { id: 'c', round: 15, home: 'Danmark', away: 'Island' }, { id: 'd', round: 15, home: 'Norge', away: 'Kroatien' },
    ];
    const p = stadigMed(HVM27, [...INDLEDENDE, ...HOVED, ...toGange]);
    expect(p.fase.navn).toBe('Hovedrunde');
    expect(p.fejl).toMatch(/«Kvartfinaler» har 4 kampe, men holdene står ikke lige mange gange .* forventet 1\)/);
    const somGruppe = { ...HVM27, faser: HVM27.faser.map((f) => (f.navn === 'Kvartfinaler' ? { ...f, knockout: false } : f)) };
    expect(stadigMed(somGruppe, [...INDLEDENDE, ...HOVED, ...toGange]).hold.size).toBe(4);
  });

  // faseHold (puljens facit) kræver ÉN gang pr. hold uanset fasens form —
  // reglen den altid har haft. På en gruppefase, hvor hvert hold står tre
  // gange, er der intet facit.
  it('faseHold: hvert hold præcis én gang — også i en fase, der ikke er knockout', () => {
    expect(faseHold(HVM27, HOVED, 'Hovedrunde')).toBeNull();
  });

  it('faseHold er uændret: et hold to gange i facit-fasen er stadig intet facit', () => {
    expect(faseHold(HVM27, [...SEMI.slice(0, 1), { ...SEMI[1], home: 'Danmark' }], 'Semifinaler')).toBeNull();
    expect(faseHold(HVM27, SEMI, 'Semifinaler')).toEqual(['Danmark', 'Tyskland', 'Frankrig', 'Kroatien']);
  });
});

describe('pulsFor — ét tips puls', () => {
  const puls = stadigMed(HVM27, [...INDLEDENDE, ...HOVED]);
  it('tæller de valgte, der er med, og nævner de udskilte i tippets rækkefølge', () => {
    expect(pulsFor(['Danmark', 'Uruguay', 'Norge', 'Angola'], puls)).toEqual({ med: 2, af: 4, ude: ['Uruguay', 'Angola'] });
    expect(pulsFor(['Danmark', 'Norge', 'Sverige', 'Island'], puls)).toEqual({ med: 4, af: 4, ude: [] });
  });
  it('null uden puls eller uden tip', () => {
    expect(pulsFor(['Danmark'], null)).toBeNull();
    expect(pulsFor(null, puls)).toBeNull();
  });
});

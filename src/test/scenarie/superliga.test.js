// Scenariets egne invarianter: det skal bære BEGGE tilstande af hver gate.
// Bliver én af dem væk (nogen "rydder op" i fixturen), er hele pointen væk —
// og de tests, der kører på scenariet, ville stå grønne uden at måle noget.
import { describe, it, expect } from 'vitest';
import { scenarie, NU, START_RUNDE, FOER_START, AFGJORT_RUNDE, FORLADT } from './superliga.js';
import { isLocked, toMillis } from '../../features/games/football/footballRounds.js';
import { matchId } from '../../lib/superligaSeed.js';
import { AABEN_RUNDE, LAAST_RUNDE, SPILLER, LIGA_ID, HOLD } from '../../../e2e/fixtures/konstanter.mjs';

const S = scenarie();
const nuMs = NU.getTime();

describe('Superliga-scenariet bærer begge tilstande af hver gate', () => {
  it('runde 20 har både en låst og en ulåst kamp — i SAMME runde', () => {
    const r20 = S.kampe.filter((m) => m.round === AABEN_RUNDE);
    expect(r20.some((m) => isLocked(m, nuMs))).toBe(true);
    expect(r20.some((m) => !isLocked(m, nuMs))).toBe(true);
    expect(isLocked(S.noegle.igang, nuMs)).toBe(true);
    expect(isLocked(S.noegle.aaben, nuMs)).toBe(false);
  });

  it('den lånte kamp fra runde 19 er ulåst og låser FØR runde 20\'s egne — inden for 2 timer', () => {
    const { laant, aaben } = S.noegle;
    expect(laant.round).toBe(LAAST_RUNDE);
    expect(isLocked(laant, nuMs)).toBe(false);
    expect(toMillis(laant.kickoff)).toBeLessThan(toMillis(aaben.kickoff));
    // Under 2 t → "snart"-markeringen; mindst 1 t → tælleren siger "1 t".
    const tilLaas = toMillis(laant.kickoff) - nuMs;
    expect(tilLaas).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(tilLaas).toBeLessThan(2 * 60 * 60 * 1000);
    // Og resten af runde 19 er spillet — så runde 19 ikke er den aktive.
    expect(S.kampe.filter((m) => m.round === LAAST_RUNDE && m.id !== laant.id).every((m) => m.result)).toBe(true);
  });

  it('runde 18 er helt afgjort og tippet — facit-blokken har noget at vise', () => {
    expect(S.noegle.afgjort.length).toBeGreaterThan(0);
    for (const m of S.noegle.afgjort) {
      expect(m.result).toMatch(/^[1X2]$/);
      expect(S.tips[m.id]).toBeDefined();
    }
    expect(AFGJORT_RUNDE).toBeGreaterThanOrEqual(START_RUNDE);
  });

  it('der findes en runde FØR startRound, med tips — så startrunde-gaten har noget at skjule', () => {
    expect(FOER_START).toBeLessThan(S.spil.startRound);
    expect(S.noegle.foerStart.length).toBeGreaterThan(0);
    expect(S.tips[S.noegle.foerStart[0].id]).toBeDefined();
  });

  it('en kamp er låst UDEN tip, en anden tippet og ulåst, og chancen står på den lånte', () => {
    expect(S.tips[S.noegle.igang.id]).toBeUndefined();
    expect(S.tips[S.noegle.aaben.id]?.pick).toBe('2');
    expect(S.tips[S.noegle.laant.id]?.chanceStake).toBe(1);
  });

  it('en forladt spiller findes med point og flag — og er ikke med i nogen liga', () => {
    const f = S.spillere.find((p) => p.uid === FORLADT.uid);
    expect(f.forladt).toBe(true);
    expect(f.totalPoints).toBeGreaterThan(0);
    expect(S.ligaer.some((l) => l.memberUids.includes(FORLADT.uid))).toBe(false);
    // Og de øvrige er IKKE forladte — begge tilstande.
    expect(S.spillere.filter((p) => !p.forladt).length).toBe(3);
  });

  it('jeg er med i præcis én af de to ligaer', () => {
    const mine = S.ligaer.filter((l) => l.memberUids.includes(SPILLER.uid));
    expect(mine.map((l) => l.id)).toEqual([LIGA_ID]);
    expect(S.ligaer.length).toBe(2);
  });

  it("deler kamp-id'er og hold med emulator-seedet (matchId over de samme hold)", () => {
    expect(S.spil.teams.map((t) => t.name)).toEqual(HOLD.map((h) => h.name));
    for (const m of S.kampe) expect(m.id).toBe(matchId(m));
    expect(S.kampe.every((m) => m.odds && m.odds[1] > 1)).toBe(true);
  });

  it('er en fabrik: to kald deler ingen objekter', () => {
    const a = scenarie();
    const b = scenarie();
    a.kampe[0].result = 'MUTERET';
    expect(b.kampe[0].result).not.toBe('MUTERET');
    expect(scenarie({ spil: { startRound: undefined } }).spil.startRound).toBeUndefined();
  });
});

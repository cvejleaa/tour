// Den offline tør-kørsel, ejeren får FØR seedGames skrives (D6): den må aldrig
// forsøge en skrivning, og dens kampe skal være de samme, som seed-football
// ville lægge ind — ellers viser udskriften noget andet end det, der skrives.
import { describe, it, expect } from 'vitest';
import { toerkoersel, fakeDb } from './toerkoersel-offline.mjs';

describe('toerkoersel-offline', () => {
  it('hvm2027, prod-nu: 0 skrivninger, 48 kampe, og begge forløb siger tør-kørsel', async () => {
    const linjer = [];
    const { skrivninger, matches } = await toerkoersel({ scenarie: 'prod-nu', log: (s) => linjer.push(s) });
    const ud = linjer.join('\n');
    expect(skrivninger).toBe(0);
    expect(matches).toHaveLength(48);
    expect(ud).toContain('TØR-KØRSEL — 5 spil i scripts/games.mjs: 1 oprettes, 0 ændres, 4 uændrede.');
    expect(ud).toContain('  • hvm2027 — Håndbold-VM 2027: OPRETTES');
    expect(ud).toContain('Odds-loft 25: 11 udfald i 11 af 48 kampe står til loftet');
    // Deadlinen, ejeren skal sætte i hånden, er rundens første kickoff.
    expect(ud).toContain('r1-srb-uru · R1 · 2027-01-13T16:30:00Z · 1358/838 · 1.11/17.23/22.24');
    expect(ud).toMatch(/=== top-10, start-Elo ===\n {1}1\. Danmark 2086\n {1}2\. Tyskland 1894\n/);
    expect(ud).toMatch(/=== de fem skæveste kampe \(odds 1\/X\/2\) ===\nr3-uru-ger · Uruguay–Tyskland · 25\/19\.04\/1\.06\n/);
    expect(ud.trimEnd().endsWith('SKRIVNINGER I ALT: 0')).toBe(true);
  });

  it('tom database: alle fem spil oprettes — stadig 0 skrivninger', async () => {
    const linjer = [];
    const { skrivninger } = await toerkoersel({ scenarie: 'tom', log: (s) => linjer.push(s) });
    expect(skrivninger).toBe(0);
    expect(linjer.join('\n')).toContain('5 oprettes, 0 ændres, 0 uændrede.');
  });

  // Tælleren er beviset for «0 skrivninger» — den skal selv kunne tælle.
  it('fake-databasen tæller hver skrivevej og læser fra docs', async () => {
    const { db, antal } = fakeDb(new Map([['a', { x: 1 }]]));
    const ref = db.collection('games').doc('a');
    expect((await ref.get()).data()).toEqual({ x: 1 });
    expect((await db.collection('games').doc('b').get()).exists).toBe(false);
    expect(antal()).toBe(0);
    ref.set({}); ref.update({}); ref.delete();
    const b = db.batch(); b.set(); b.update(); b.delete(); b.commit();
    expect(antal()).toBe(7);
  });

  it('afviser et ukendt scenarie og et spil uden post', async () => {
    await expect(toerkoersel({ scenarie: 'prod' })).rejects.toThrow('Ukendt scenarie: prod (prod-nu eller tom).');
    await expect(toerkoersel({ gameId: 'findes-ikke' })).rejects.toThrow('findes-ikke står ikke i scripts/games.mjs.');
  });
});

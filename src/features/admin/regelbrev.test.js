import { describe, it, expect } from 'vitest';
import { REGELBREV, BAGFYLDNING, NUVAERENDE_REGEL } from './regelbrev';
import { TRAEF_BONUS, ODDS } from '../../lib/superligaScoring';

// ---------------------------------------------------------------------------
// Brevet undskylder for, at der blev sendt to forskellige forklaringer på den
// SAMME regel ud på to dage. Testene her findes for at det ikke sker igen:
// brevet skal sige det, koden gør — ikke det, jeg troede, da jeg skrev det.
// ---------------------------------------------------------------------------
describe('regelbrevet', () => {
  // Prøves på SÆTNINGEN om nutiden, ikke på hele brevet. Brevet forklarer også
  // den gamle regel ("et tip værd sine odds plus én"), så en test på hele
  // teksten kan ikke skelne fortid fra løfte — den fejlede netop på det.
  it('siger det samme om træf-bonussen som koden gør', () => {
    expect(REGELBREV.tekst).toContain(NUVAERENDE_REGEL);
    if (TRAEF_BONUS === 0) {
      expect(NUVAERENDE_REGEL).toContain('Hverken mere eller mindre');
      expect(NUVAERENDE_REGEL).not.toContain('plus');
    } else {
      expect(NUVAERENDE_REGEL).toContain('plus');
    }
  });

  it('nævner det loft, der faktisk gælder', () => {
    const somTekst = ODDS.MAX.toFixed(1).replace('.', ',');
    expect(REGELBREV.tekst).toContain(`hævet til ${somTekst}`);
  });

  // Det var netop et forkert tal i en mail, der startede hele forvirringen.
  it('bruger bagfyldningens verificerede tal, ikke runde tal', () => {
    expect(REGELBREV.tekst).toContain(`${BAGFYLDNING.bets} tips`);
    expect(REGELBREV.tekst).toContain(`alle ${BAGFYLDNING.spillere} spillere`);
    expect(BAGFYLDNING).toEqual({ bets: 48, spillere: 12, prBet: -1 });
  });

  // Den første mail sagde "to gange i dag". Det passede ikke, og det var netop
  // dét, ejeren rettede. Brevet skal have den rigtige tidslinje.
  it('holder tidslinjen over to dage, ikke én', () => {
    // Datoerne står i begyndelsen af en sætning og får stort begyndelsesbogstav.
    expect(REGELBREV.tekst).toMatch(/onsdag den 5\. august/i);
    expect(REGELBREV.tekst).toMatch(/torsdag den 6\. august/i);
    expect(REGELBREV.tekst).not.toMatch(/to gange i dag/i);
  });

  it('siger klart, at runde 1 og 2 ikke er rørt af loft-ændringen', () => {
    expect(REGELBREV.tekst).toContain('Runde 1 og 2 er ikke rørt');
  });

  // En undskyldning, der ikke undskylder, er en pressemeddelelse.
  it('undskylder faktisk', () => {
    expect(REGELBREV.tekst).toMatch(/[Uu]ndskyld/);
    expect(REGELBREV.tekst).toContain('regnefejl');
  });

  it('har et emne, der kan læses i en indbakke', () => {
    expect(REGELBREV.emne.length).toBeGreaterThan(10);
    expect(REGELBREV.emne.length).toBeLessThan(80);
  });
});

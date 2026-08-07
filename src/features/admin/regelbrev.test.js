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

  // Brevet skal sige, at loftet er VÆK — ikke at det er hævet. De to
  // formuleringer betyder noget forskelligt for den, der tipper outsidere.
  it('siger at loftet er fjernet, ikke hævet', () => {
    expect(REGELBREV.tekst).toContain('Nu er der intet loft');
    expect(REGELBREV.tekst).not.toMatch(/loftet er hævet/i);
    expect(ODDS.MAX).toBeUndefined();
  });

  // Uafgjort bliver BILLIGERE af denne ændring. Brevet må ikke lade som om
  // alting bliver bedre for alle — det var netop den slags, der skabte rodet.
  it('siger rent ud, at uafgjort bliver billigere', () => {
    expect(REGELBREV.tekst).toMatch(/uafgjort bliver lidt billigere/i);
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

  // Brevet må IKKE love, at loftet gælder fra en bestemt runde. Odds skrives
  // om af serveren, når et facit ændrer sig — så fredagskampen låser med det
  // gamle loft, uanset hvornår vi udruller. Første udkast lovede "fra runde 3",
  // og det ville have været fjerde gang, teksten og virkeligheden ikke passede.
  it('lover ikke en bestemt runde, men siger at spillede kampe er urørte', () => {
    expect(REGELBREV.tekst).toContain('Færdigspillede runder er ikke rørt');
    expect(REGELBREV.tekst).not.toMatch(/gælder fra runde/i);
    // Tidligere stod her "kan kun trække odds OP". Det holdt for loftet alene,
    // men uafgjort-rettelsen trækker NED. Brevet må ikke love det modsatte.
    expect(REGELBREV.tekst).not.toMatch(/kun trække odds OP/i);
  });

  // Målingen med combi viste, at loftet IKKE gør spillet balanceret. Brevet må
  // ikke påstå mere, end vi har målt — det var netop fejlen første gang.
  it('lover ikke, at spillet nu er i balance', () => {
    expect(REGELBREV.tekst).toContain('det retter ikke alt');
    expect(REGELBREV.tekst).not.toMatch(/nu er (spillet )?i balance/i);
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

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

  // RUNDE 3, ikke runde 4. Her har formuleringen skiftet to gange, og begge
  // skift var rigtige på deres tidspunkt:
  //
  //   1. udkast: "runde 3 starter i aften og kører på reglerne her" — FORKERT,
  //      runde 3's kupon var prissat under det gamle loft.
  //   2. udkast: "gælder fra RUNDE 4" — rigtigt, SÅ LÆNGE odds kun kunne
  //      skrives om, når et resultat landede.
  //   nu:       "gælder fra RUNDE 3" — fordi omprisningen nu kan startes med
  //      en knap, og ejeren har valgt at gøre det før rundens første kickoff.
  //
  // Præmissen bag udkast 2 er altså væk, ikke overtrådt. Testen følger med.
  it('gælder fra runde 3 og siger, at spillede runder er urørte', () => {
    expect(REGELBREV.tekst).toMatch(/gælder fra RUNDE 3/);
    expect(REGELBREV.tekst).toMatch(/ingen point er ændret bagud/i);
    expect(REGELBREV.tekst).not.toMatch(/gælder fra RUNDE 4/);
    // Runde 3 må ikke fremstilles som om den kørte på de gamle regler.
    expect(REGELBREV.tekst).not.toMatch(/blev spillet under de gamle odds/);
    // Tidligere stod her "kan kun trække odds OP". Det holdt for loftet alene,
    // men uafgjort-rettelsen trækker NED. Brevet må ikke love det modsatte.
    expect(REGELBREV.tekst).not.toMatch(/kun trække odds OP/i);
  });

  // DEN UBEHAGELIGE SANDHED SKAL STÅ DER. Omprisningen af runde 3 gør
  // uafgjort BILLIGERE — også i aftenens kamp — så den, der har tippet X,
  // taber værdi på et tip, han allerede har afgivet. Et brev, der kun nævner
  // det, der er til spillernes fordel, er ikke en undskyldning.
  it('siger ligeud, at et X-tip i aftenens kamp er blevet mindre værd', () => {
    expect(REGELBREV.tekst).toMatch(/Sønderjyske–Viborg/);
    expect(REGELBREV.tekst).toMatch(/mindre værd/i);
    expect(REGELBREV.tekst).toMatch(/ikke kun til jeres fordel/i);
  });

  // Den eneste handling, spilleren HAR: tips kan rettes indtil kickoff. Uden
  // den sætning fratager brevet ham reaktionen ved at fortælle ham for sent.
  it('fortæller, at tips kan rettes indtil kampstart', () => {
    expect(REGELBREV.tekst).toMatch(/kan (ændres|rettes) .{0,30}kampstart/i);
    expect(REGELBREV.tekst).toMatch(/der er tid/i);
  });

  // De to septemberkampe er runde 3, men spilles først om en måned. De er
  // nemme at glemme, netop fordi de ikke ligger i rundens uge — og en spiller,
  // der allerede har tippet dem, ville ellers opdage prisskiftet selv.
  it('nævner de to runde 3-kampe i september', () => {
    expect(REGELBREV.tekst).toMatch(/AGF–FCM/);
    expect(REGELBREV.tekst).toMatch(/FCK–FCN/);
    expect(REGELBREV.tekst).toMatch(/september/i);
  });

  // PÅSTANDEN, DER VAR FALSK. Brevet lovede, at to gæt "aldrig igen" kan stå
  // til samme pris. Er udeholdet præcis HFA (60 point) stærkere, er 1 og 2
  // matematisk identiske — det sker i Premier League (Brentford mod Aston
  // Villa) to gange på en sæson. Loftet var problemet; HFA-sammenfaldet er en
  // egenskab ved modellen. Lov det ikke.
  it('lover ikke, at to udfald aldrig kan stå til samme pris', () => {
    expect(REGELBREV.tekst).not.toMatch(/aldrig igen (kan )?stå til nøjagtig samme pris/i);
    expect(REGELBREV.tekst).not.toMatch(/kan aldrig .{0,30}samme pris/i);
  });

  // Chancens REGLER er uændrede, men dens maksimale udbetaling er det ikke.
  // "Chancen er uændret" fortav den største praktiske konsekvens.
  it('siger, at Chancen kan give mere end før', () => {
    expect(REGELBREV.tekst).toMatch(/Chancens REGLER er uændrede/);
    expect(REGELBREV.tekst).toMatch(/56 point/);
  });

  // Brevet må ikke genindføre et loft i teksten. Mutationstesten viste, at man
  // kunne indsætte "Nu er der et loft på 8,00 i stedet." uden at noget blev
  // rødt, fordi testene kun tjekkede for TILSTEDEVÆRELSE af én sætning.
  //
  // Bemærk, at brevet GODT må beskrive det gamle loft ("der har hele tiden
  // været et loft på 6,00") — det er fortid og hele forklaringen. Det, der
  // ikke må stå, er et loft i nutid. Et bredt forbud mod "loft på \d" fangede
  // den historiske sætning og ville have tvunget forklaringen ud af brevet.
  it('nævner ikke noget loft, der gælder NU', () => {
    expect(REGELBREV.tekst).not.toMatch(/[Nn]u er der et loft/);
    expect(REGELBREV.tekst).not.toMatch(/nyt loft/i);
    expect(REGELBREV.tekst).not.toMatch(/loftet er (nu |sat |hævet )?til \d/i);
    expect(REGELBREV.tekst).not.toMatch(/højst \d+[,.]\d+ point/);
    // Og det gamle loft skal stadig forklares — ellers giver resten ikke mening.
    expect(REGELBREV.tekst).toMatch(/har hele tiden været et loft på 6,0/);
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

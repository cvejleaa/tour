/**
 * Tests for farve-aflæsningen i holdfarver-wikipedia.mjs.
 *
 * Der var ingen. Test Manager kørte syv mutationer mod scriptet — tærsklen
 * sat tilbage, alle fire HAANDSAT-vagter fjernet, hele tabellen tømt — og
 * ALLE SYV overlevede med 1804 grønne tests. Både vagten, dens genstand og
 * tærsklen kunne ændres uden ét rødt tegn.
 *
 * Pixels er syntetiske og bygget efter de MÅLTE andele fra de rigtige
 * grafikker, så testene kører offline og deterministisk. Tallene står i
 * kommentarerne, og `scripts/holdfarver-taerskel.mjs` kører den samme måling
 * mod de ægte PNG'er.
 */
import { describe, it, expect } from 'vitest';
import {
  flader, troejefarver, haandsat, opdaterRaekke,
} from './holdfarver-wikipedia.mjs';

/** Byg en pixelliste med n af hver farve, i den rækkefølge de er nævnt. */
function px(...par) {
  const ud = [];
  for (const [hex, n] of par) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < n; i += 1) ud.push({ x: ud.length % 46, y: Math.floor(ud.length / 46), r, g, b });
  }
  return ud;
}

// Bournemouths hjemmetrøje, målt: sort 1202 px, og den RØDE delt over tre
// nuancer af kantudjævning — 308 + 201 + 114. Det er hele grunden til, at
// holdet står i HAANDSAT.
const BOURNEMOUTH = px(['#000000', 1202], ['#FF2C2C', 308], ['#FFFFFF', 244], ['#FF0000', 201], ['#F30000', 114]);

// Nottingham Forests hjemmetrøje: TO designrøde, begge store — 49,0 % og
// 33,1 % — kun 56 fra hinanden. De skal IKKE lægges sammen.
const FOREST = px(['#D70926', 490], ['#F30310', 331], ['#FFFFFF', 179]);

describe('flader — tærsklen for "samme farve"', () => {
  // TÆRSKLEN ER 40, OG DEN ER ET KOMPROMIS. Denne test holder BEGGE sider af
  // den fast, så en ændring i hver retning bliver rød.
  it('holder Forests to designrøde adskilt ved 40 — de ligger kun 56 fra hinanden', () => {
    const f = flader(FOREST, 40);
    expect(f[0].hex).toBe('#D70926');
    expect(f[1].hex).toBe('#F30310');
    // Begge er store nok til at være trøjefarver.
    expect(f[0].andel).toBeGreaterThan(0.45);
    expect(f[1].andel).toBeGreaterThan(0.30);
  });

  // DEN MODSATTE RETNING. Hæver nogen tærsklen for at redde Bournemouth,
  // smelter Forests to røde sammen til én farve, der ikke findes på trøjen.
  // Det SKETE — og tør-kørslen viste det som "±2 i en kanal".
  it('smelter Forests røde sammen ved 100 — derfor må tærsklen ikke hæves', () => {
    const f = flader(FOREST, 100);
    expect(f[0].hex).toBe('#E2071D');   // en rød, der ikke findes på trøjen
    expect(f[0].andel).toBeCloseTo(0.821, 2);
    expect(f.map((x) => x.hex)).not.toContain('#D70926');
  });

  it('lægger Bournemouths tre røde nuancer sammen ved 100, men ikke ved 40', () => {
    const ved40 = flader(BOURNEMOUTH, 40).filter((f) => f.hex.startsWith('#F'));
    // Ved 40 står #FF2C2C alene, og #FF0000/#F30000 slås sammen — tre røde
    // bliver til to små flader i stedet for én stor.
    expect(ved40.length).toBeGreaterThanOrEqual(2);

    const ved100 = flader(BOURNEMOUTH, 100);
    const roed = ved100.find((f) => f.hex.startsWith('#FE') || f.hex.startsWith('#FD'));
    expect(roed).toBeDefined();
    expect(roed.andel).toBeGreaterThan(0.29);
  });

  // Tærsklen må ALDRIG blande to forskellige farver sammen. Tallene er de
  // faktisk målte afstande, og båndet er tosidet: bliver tærsklen sat til 150,
  // ryger Leeds' bleggule pinstriber ind i det hvide, og testen bliver rød.
  it('blander ikke to forskellige farver — rød/sort 255, himmelblå/hvid 363, Leeds bleggul/hvid 129', () => {
    const afstand = (a, b) => [1, 3, 5]
      .reduce((s, i) => s + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0);
    expect(afstand('#FF0000', '#000000')).toBe(255);
    expect(afstand('#2C94D2', '#FFFFFF')).toBe(363);
    expect(afstand('#FFF489', '#FFFFFF')).toBe(129);

    // Leeds er den tætteste af de tre — og den, der falder først.
    const leeds = flader(px(['#FFFFFF', 676], ['#FFF489', 126]), 40);
    expect(leeds.map((f) => f.hex)).toContain('#FFF489');
    const forHoejt = flader(px(['#FFFFFF', 676], ['#FFF489', 126]), 150);
    expect(forHoejt.map((f) => f.hex)).not.toContain('#FFF489');
  });
});

describe('flader — STANDARDVÆRDIEN', () => {
  // DE OVENSTÅENDE TESTS DÆKKER IKKE STANDARDEN. Jeg muterede `afstand = 40`
  // til `100` og fik 27 grønne: hver test sendte sin egen tærskel med og rørte
  // aldrig standardværdien — som er den, alle tyve hold rent faktisk aflæses
  // med. Nøjagtig samme form for blindhed som resten af filen handler om.
  it('er 40, så Forest beholder sine to røde uden et argument', () => {
    const f = flader(FOREST);
    expect(f[0].hex).toBe('#D70926');
    expect(f[1].hex).toBe('#F30310');
  });

  it('er 40, så Bournemouth bliver ensfarvet — og derfor står håndsat', () => {
    const t = troejefarver({}, 1, { flader: flader(BOURNEMOUTH), px: BOURNEMOUTH });
    expect(t.moenster).toBe('ensfarvet');
    expect(t.primaer).toBe('#000000');
  });

  it('er 40, så Man City ikke får bøjler, den ikke har', () => {
    // Målt: #A2CFF2 54,5 % mod #DFEFFC 42,0 %, afstand 103. Ved 100 smelter de
    // sammen og gør en ensfarvet himmelblå trøje bøjlet.
    const city = px(['#A2CFF2', 545], ['#DFEFFC', 420], ['#FFFFFF', 35]);
    expect(flader(city).map((f) => f.hex)).toContain('#DFEFFC');
  });
});

describe('troejefarver — bliver trøjen mønstret eller ensfarvet?', () => {
  const form = (pixels, afstand) => troejefarver({}, 1, { flader: flader(pixels, afstand), px: pixels });

  // DET ER DEN HER, DER GØR BOURNEMOUTH HÅNDSAT. Ved tærsklen 40 taber den
  // røde, fordi den er delt i tre, og en rød/sort stribet trøje bliver sort.
  it('Bournemouth bliver ENSFARVET SORT ved 40 — fejlen, der begrunder HAANDSAT', () => {
    const t = form(BOURNEMOUTH, 40);
    expect(t.moenster).toBe('ensfarvet');
    expect(t.primaer).toBe('#000000');
  });

  it('Bournemouth bliver rød og mønstret ved 100 — men det koster Forest', () => {
    const t = form(BOURNEMOUTH, 100);
    expect(t.moenster).not.toBe('ensfarvet');
    expect(t.primaer).toBe('#FD1616');   // præcis den værdi, holdfilen bærer
    expect(t.sekundaer).toBe('#000000');
  });

  it('Forest beholder sine to røde ved 40', () => {
    const t = form(FOREST, 40);
    expect(t.moenster).not.toBe('ensfarvet');
    // Krominans vælger den mest mættede af de to som primær.
    expect(t.primaer).toBe('#F30310');
    expect(t.sekundaer).toBe('#D70926');
  });

  it('Forest bliver ensfarvet ved 100 — regressionen, der blokerede rettelsen', () => {
    expect(form(FOREST, 100).moenster).toBe('ensfarvet');
  });
});

describe('HAANDSAT — trøjer, kilden ikke kan', () => {
  // Hver post skal kunne dræbes for sig. Fjernes én, bliver præcis én test rød.
  it.each([
    ['Bournemouth', 1, /kantudjævning/],
    ['Aston Villa', 2, /infoboksen/],
    ['Leeds United', 3, /infoboksen/],
    ['Fulham', 1, /ærmer|leftarm1/],
    ['Fulham', 2, /ternet|tern/],
  ])('%s trøje %i står håndsat med en begrundelse', (navn, n, grund) => {
    expect(haandsat(navn, n)).toMatch(grund);
  });

  // Og den modsatte vej: de nitten andre må IKKE være fredet, ellers holder
  // kilden op med at kunne rette dem.
  it.each([
    ['Bournemouth', 2], ['Aston Villa', 1], ['Aston Villa', 3],
    ['Leeds United', 1], ['Leeds United', 2], ['Fulham', 3],
    ['Arsenal', 1], ['Newcastle United', 1], ['Manchester City', 1],
  ])('%s trøje %i er IKKE fredet', (navn, n) => {
    expect(haandsat(navn, n)).toBeNull();
  });
});

describe('opdaterRaekke — den håndsatte værdi overlever kilden', () => {
  const LINJE = "  { name: 'Fulham', short: 'FUL', elo: 1480, color: '#FAFAFA', awayColor: '#FF0000', thirdColor: '#6CACE4', troejer: { hjemme: { aerme: '#111111' }, ude: { sekundaer: '#000000', moenster: 'ternet' } }, venue: 'Craven Cottage' },";
  const kilde = {
    1: { primaer: '#123456', sekundaer: null, moenster: 'ensfarvet', aerme: '#123456' },
    2: { primaer: '#654321', sekundaer: null, moenster: 'ensfarvet', aerme: '#654321' },
    3: { primaer: '#ABCDEF', sekundaer: null, moenster: 'ensfarvet', aerme: '#ABCDEF' },
  };

  // BÆRENDE TEST. Kilden foreslår noget helt andet for alle tre trøjer, og de
  // to fredede skal komme uændret ud. Fjernes en af vagterne, bliver den rød.
  it('lader Fulhams fredede farver stå, når kilden foreslår andet', () => {
    const ny = opdaterRaekke(LINJE, 'Fulham', kilde);
    expect(ny).toContain("color: '#FAFAFA'");
    expect(ny).toContain("awayColor: '#FF0000'");
    expect(ny).not.toContain('#123456');
    expect(ny).not.toContain('#654321');
  });

  // ASYMMETRIEN, dokumenteret. Fulham er fredet på trøje 1 og 2, IKKE på 3 —
  // så tredjefarven opdateres, mens hele `troejer`-feltet står fast. Den
  // forskel er nem at læse forkert, og derfor står den her som en test.
  it('opdaterer Fulhams tredjefarve, som ikke er fredet', () => {
    expect(opdaterRaekke(LINJE, 'Fulham', kilde)).toContain("thirdColor: '#ABCDEF'");
  });

  it('bevarer Fulhams tern — det var dem, der kun overlevede ved et tilfælde', () => {
    const ny = opdaterRaekke(LINJE, 'Fulham', kilde);
    expect(ny).toContain("moenster: 'ternet'");
    expect(ny).toContain("aerme: '#111111'");
  });

  // Og kontrollen: et hold UDEN fredning skal faktisk kunne opdateres, ellers
  // beviser testen ovenfor kun, at funktionen ikke gør noget som helst.
  it('opdaterer et hold, der ikke er fredet', () => {
    const arsenal = "  { name: 'Arsenal', short: 'ARS', elo: 1664, color: '#EC0000', awayColor: '#062967', thirdColor: '#F8F6BB', troejer: { hjemme: { aerme: '#FFFFFF' } }, venue: 'Emirates Stadium' },";
    const ny = opdaterRaekke(arsenal, 'Arsenal', kilde);
    expect(ny).toContain("color: '#123456'");
    expect(ny).toContain("awayColor: '#654321'");
    expect(ny).not.toBe(arsenal);
  });

  // En erstatning, der ikke matcher, fejlede før TAVST.
  it('kaster, hvis et farvefelt mangler i linjen', () => {
    expect(() => opdaterRaekke("  { name: 'X', short: 'X' },", 'X', kilde)).toThrow(/color/);
  });
});

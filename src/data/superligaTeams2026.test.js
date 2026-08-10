/**
 * Tests for Superligaens holddata.
 *
 * Der var ingen — hverken for Elo eller for farverne. Det betød, at seks af
 * de tolv holds hjemmefarve kunne være forkert i månedsvis uden et rødt tegn,
 * og det VAR de: farverne var skrevet fra hukommelsen om klubbernes farver, og
 * hukommelsen huskede klubfarven i stedet for trøjen.
 *
 * Hver rettelse herunder assertérer BÅDE den nye værdi og at den gamle,
 * forkerte er væk. Et bånd, der rummer begge, ville ikke måle noget.
 */
import { describe, it, expect } from 'vitest';
import { SUPERLIGA_TEAMS_2026, superligaEloMap, superligaTeamInfo } from './superligaTeams2026';

const hold = (navn) => SUPERLIGA_TEAMS_2026.find((t) => t.name === navn);

describe('Superligaen — listens form', () => {
  it('har præcis tolv hold', () => {
    expect(SUPERLIGA_TEAMS_2026).toHaveLength(12);
  });

  it('har entydige navne og kortkoder', () => {
    const navne = SUPERLIGA_TEAMS_2026.map((t) => t.name);
    const koder = SUPERLIGA_TEAMS_2026.map((t) => t.short);
    expect(new Set(navne).size).toBe(12);
    expect(new Set(koder).size).toBe(12);
  });

  it('har tre gyldige hex-farver på hvert hold', () => {
    for (const t of SUPERLIGA_TEAMS_2026) {
      for (const felt of ['color', 'awayColor', 'thirdColor']) {
        expect(t[felt], `${t.name}.${felt}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  // En hjemmefarve, der er identisk med holdets egen udefarve, gør
  // clash-reglen indholdsløs: der er intet at skifte til.
  it('lader intet hold have samme hjemme- og udefarve', () => {
    for (const t of SUPERLIGA_TEAMS_2026) {
      expect(t.awayColor, t.name).not.toBe(t.color);
    }
  });
});

// ---------------------------------------------------------------------------
// DE SEKS RETTEDE. Kilden er fotos af de faktiske 2026/27-trøjer (bold.dk).
// Hver test navngiver den gamle værdi, så rettelsen ikke kan rulle tilbage
// ubemærket.
// ---------------------------------------------------------------------------
describe('hjemmefarver rettet efter fotos af 2026/27-trøjerne', () => {
  // Pinstriberne måler 9,7 % — under 12 %-gulvet — og deres røde kunne slet
  // ikke måles rent. Trøjen står derfor ensfarvet sort, uden en opfundet rød.
  it('FCM er SORT og ensfarvet — ikke rød', () => {
    const t = hold('FC Midtjylland');
    expect(t.color).toBe('#0B0807');
    expect(t.color).not.toBe('#E4002B');            // den gamle, forkerte
    expect(t.troejer).toBeUndefined();
  });

  it('FCK er HVID — marineblå er deres anden farve, ikke trøjen', () => {
    const t = hold('F.C. København');
    expect(t.color).toBe('#FFFFFF');
    expect(t.color).not.toBe('#0A2240');
    // Den gamle primærfarve er flyttet til udefarven, ellers stod hvid mod hvid.
    expect(t.awayColor).toBe('#0A2240');
  });

  // Bøjlerne er tynde — 1,4 % på fotoet, 6,9 % i den flade grafik. BEGGE
  // kilder er enige, så trøjen står ensfarvet efter samme test, der gjorde
  // Leeds' pinstriber til en hvid trøje.
  it('FCN er RØD og ensfarvet — ikke gul', () => {
    const t = hold('FC Nordsjælland');
    expect(t.color).toBe('#B80112');
    expect(t.color).not.toBe('#FFD200');
    expect(t.troejer).toBeUndefined();
  });

  it('Randers er LYSEBLÅ — ikke marineblå', () => {
    const t = hold('Randers FC');
    expect(t.color).toBe('#78C5ED');
    expect(t.color).not.toBe('#003C7E');
    // Skråbåndet KAN nu tegnes — `skraabaand` kom til, netop fordi trøjen
    // ellers måtte stå ensfarvet. Se mønster-blokken nedenfor.
    expect(t.troejer.hjemme.moenster).toBe('skraabaand');
  });

  it('Sønderjyske er LYSEBLÅ med hvide striber — ikke marineblå', () => {
    const t = hold('Sønderjyske Fodbold');
    expect(t.color).toBe('#B3D6E9');
    expect(t.color).not.toBe('#1B3A6B');
    expect(t.troejer.hjemme.moenster).toBe('striber');
    // Den HVIDE stribe var utestet: #FFFFFF → #000000 gav 1863 grønne.
    expect(t.troejer.hjemme.sekundaer).toBe('#FFFFFF');
    // Udefarven var den gamle primærfarve, flyttet hertil for ikke at stå hvid
    // mod hvid. Den begrundelse er afløst af en MÅLING på den rigtige trøje.
    // Låsen står HER og ikke kun i blokken nedenfor: `not.toBe` alene tillader
    // hvad som helst undtagen én værdi, og så er assertionen dekoration.
    expect(t.awayColor).toBe('#682844');
  });

  it('Silkeborg er RØD — ikke blå', () => {
    const t = hold('Silkeborg IF');
    expect(t.color).toBe('#CA202C');
    expect(t.color).not.toBe('#003DA5');
    // Den blå var klubbens anden farve, parkeret som tredjefarve. Også den er
    // nu målt på den rigtige trøje.
    expect(t.thirdColor).toBe('#FCB2B9');
  });
});

// ---------------------------------------------------------------------------
// UDE- OG TREDJEFARVER, MÅLT PÅ KLUBBERNES EGNE BUTIKKER.
//
// Elleve af dem var skrevet på fornemmelse, og fire var direkte forkerte: OB og
// Randers stod begge med HVID udebane, hvor de spiller i sort og mørk blågrå.
//
// Tallene her er de samme, som `scripts/superliga-ude-tredje.mjs` måler. Den
// test kan ikke køre i CI (den henter fra seks butikkers CDN'er), så den her
// låser resultatet fast: ændrer nogen et tal i datafilen uden at måle om,
// bliver det rødt her.
// ---------------------------------------------------------------------------
describe('ude- og tredjefarver målt på klubbernes trøjer', () => {
  it.each([
    ['Sønderjyske Fodbold', 'awayColor', '#682844', 'bordeaux'],
    ['Lyngby Boldklub', 'thirdColor', '#25336D', 'marineblå'],
    ['F.C. København', 'thirdColor', '#76CABF', 'mintgrøn'],
    ['Brøndby IF', 'awayColor', '#122859', 'marineblå'],
    ['Brøndby IF', 'thirdColor', '#2E2926', 'meget mørk brun'],
    ['FC Nordsjælland', 'awayColor', '#111B34', 'mørk marineblå'],
    ['OB', 'awayColor', '#1E2121', 'sort'],
    ['OB', 'thirdColor', '#E5C6CB', 'lyserød'],
    ['Randers FC', 'awayColor', '#33384F', 'mørk blågrå'],
    ['Randers FC', 'thirdColor', '#FC8033', 'orange'],
    ['Silkeborg IF', 'thirdColor', '#FCB2B9', 'lyserød'],
  ])('%s %s er %s (%s)', (navn, felt, vaerdi) => {
    expect(hold(navn)[felt]).toBe(vaerdi);
  });

  // MODPRØVEN. De fire, der var direkte forkerte, må ikke snige sig tilbage.
  // Uden den her ville en test på "OB har en udefarve" bestå med hvid igen.
  it.each([
    ['OB', 'awayColor', '#FFFFFF'],
    ['OB', 'thirdColor', '#F26419'],
    ['Randers FC', 'awayColor', '#FFFFFF'],
    ['Randers FC', 'thirdColor', '#003C7E'],
  ])('%s %s er IKKE den gamle %s', (navn, felt, gammel) => {
    expect(hold(navn)[felt]).not.toBe(gammel);
  });

  // MØNSTRE, DER ER TJEKKET OG FRAVALGT. Listen matcher kommentaren i
  // datafilen — hverken mere eller mindre. Første udgave havde FC Nordsjælland
  // med (som ikke har noget fravalgt mønster) og UDELOD OB, hvis ternede
  // tredjetrøje er den eneste af dem, badgen faktisk kan tegne. Netop den
  // kunne altså sniges ind med grøn suite.
  it.each([
    ['OB', 'tredje', 'tern i to lyserøde med kun 1,12:1 i kontrast'],
    ['OB', 'ude', 'én lodret stribe — ingen form passer, og under 12 %'],
    ['Lyngby Boldklub', 'ude', 'bånd på 0,61 px ved 22 px'],
    ['Brøndby IF', 'tredje', 'bronzemønster på 1,9 %'],
    ['Randers FC', 'ude', 'lyserødt gitter på 16,5 %'],
  ])('%s har intet mønster på %s-trøjen (%s)', (navn, variant) => {
    expect(hold(navn).troejer?.[variant]).toBeUndefined();
  });

  // MODPRØVEN. De tre, der BESTOD testen, skal have deres mønster — og med den
  // rigtige form. Uden dem ville testen ovenfor bestå, selv hvis alle mønstre
  // var fjernet, og det var netop tilstanden før de tre nye former kom til.
  it.each([
    ['Randers FC', 'hjemme', 'skraabaand', '#30374F'],
    ['Randers FC', 'tredje', 'ternet', '#292A3F'],
    ['Brøndby IF', 'ude', 'baand', '#EBBF4D'],
  ])('%s %s-trøjen er %s', (navn, variant, moenster, sekundaer) => {
    const t = hold(navn).troejer[variant];
    expect(t.moenster).toBe(moenster);
    expect(t.sekundaer).toBe(sekundaer);
  });

  // FORMEN SKAL VÆRE DEN RIGTIGE, ikke bare en form. Brøndbys ene brystbånd
  // tegnet som `boejler` bliver til to bånd — en anden trøje end den, klubben
  // spiller i. Det var hele grunden til, at den stod ensfarvet før.
  it('bruger baand og ikke boejler til Brøndbys ene brystbånd', () => {
    expect(hold('Brøndby IF').troejer.ude.moenster).not.toBe('boejler');
  });

  // Og Randers' to trøjer må ikke få samme form: den ene er et skråbånd, den
  // anden kvarterer.
  it('giver Randers to FORSKELLIGE former', () => {
    const t = hold('Randers FC').troejer;
    expect(t.hjemme.moenster).not.toBe(t.tredje.moenster);
  });
});

describe('mønstre, der var rigtige i farven men manglede formen', () => {
  it.each([
    ['OB', '#FFFFFF'],             // blå/hvid lodret stribet
    ['AC Horsens', '#292724'],     // gul/sort lodret stribet
  ])('%s er stribet', (navn, sekundaer) => {
    const t = hold(navn);
    expect(t.troejer.hjemme.moenster).toBe('striber');
    expect(t.troejer.hjemme.sekundaer).toBe(sekundaer);
  });

  // Og modsat: de ensfarvede HJEMMEtrøjer må IKKE have fået et mønster på.
  // Randers er ude af listen — deres skråbånd blev målt til 21,3 % og 6,18:1
  // og kan nu tegnes, fordi `skraabaand` kom til.
  it.each(['Brøndby IF', 'Viborg FF', 'Lyngby Boldklub', 'F.C. København',
    'AGF', 'FC Midtjylland', 'FC Nordsjælland', 'Silkeborg IF'])(
    '%s står ensfarvet', (navn) => {
      expect(hold(navn).troejer?.hjemme?.moenster).toBeUndefined();
    },
  );

  // PRÆCIS FIRE hjemmetrøjer bærer mønster. Tallet er en målt beslutning, ikke
  // en æstetisk: får en femte et mønster, uden at målingen siger det, skal den
  // her være rød. Randers kom til, da `skraabaand` gjorde formen tegnelig.
  it('har præcis fire mønstrede hjemmetrøjer', () => {
    const medMoenster = SUPERLIGA_TEAMS_2026.filter((t) => t.troejer?.hjemme?.moenster);
    expect(medMoenster.map((t) => t.name).sort())
      .toEqual(['AC Horsens', 'OB', 'Randers FC', 'Sønderjyske Fodbold']);
  });

  // OG PÅ TVÆRS AF ALLE TRE VARIANTER. Hjemmetrøjerne var dækket; ude og tredje
  // var det ikke, og det var netop dér, de tre nye former landede.
  it('har præcis seks mønstrede trøjer i alt', () => {
    const alle = [];
    for (const t of SUPERLIGA_TEAMS_2026) {
      for (const v of ['hjemme', 'ude', 'tredje']) {
        if (t.troejer?.[v]?.moenster) alle.push(`${t.name} ${v}`);
      }
    }
    expect(alle.sort()).toEqual([
      'AC Horsens hjemme',
      'Brøndby IF ude',
      'OB hjemme',
      'Randers FC hjemme',
      'Randers FC tredje',
      'Sønderjyske Fodbold hjemme',
    ]);
  });
});

describe('opslagsfunktionerne', () => {
  // HELE tabellen, ikke kun antallet og ét hold. Mutationen Viborg
  // 1486 → 1000 gav 1863 grønne, og Elo er forretningskritisk: den går via
  // seeding til eloHome/eloAway, videre til odds og dermed til point.
  it('gengiver hvert holds Elo', () => {
    expect(superligaEloMap()).toEqual({
      'FC Midtjylland': 1657,
      'F.C. København': 1657,
      'Brøndby IF': 1581,
      AGF: 1578,
      'FC Nordsjælland': 1537,
      'Viborg FF': 1486,
      OB: 1486,
      'Randers FC': 1472,
      'Sønderjyske Fodbold': 1465,
      'Silkeborg IF': 1453,
      'AC Horsens': 1420,
      'Lyngby Boldklub': 1413,
    });
  });

  // Et ukendt navn skal give null, ikke et tilfældigt hold. Fallbacken til
  // 1500 i teamElo er tavs, og det er præcis den fælde, holdlisterne findes for.
  it('giver null for et navn, listen ikke kender', () => {
    expect(superligaTeamInfo('FC Ukendt')).toBeNull();
  });

  it('finder et hold på dets eksakte navn', () => {
    expect(superligaTeamInfo('OB')?.short).toBe('OB');
  });
});

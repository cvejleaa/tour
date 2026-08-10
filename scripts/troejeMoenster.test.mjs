// ---------------------------------------------------------------------------
// Tofarvet-testen — den beslutning, der afgør hvilke trøjer der bærer mønster.
//
// Den lå inline i `superliga-ude-tredje.mjs` og var HELT udækket: tærsklen
// kunne sættes fra 2 til 1, så OB's tern på 1,12:1 ville stå som "BESTÅR", med
// alle 2022 tests grønne. Samme hul som `holdfarver-wikipedia.mjs` havde.
//
// TALLENE ER DE SEKS FAKTISK MÅLTE MØNSTRE, ikke opfundne eksempler. Kører man
// `node scripts/superliga-ude-tredje.mjs --moenster`, kommer præcis de her tal
// ud, og de står også i kommentaren i `superligaTeams2026.js`. Så er testen
// bundet til virkeligheden og ikke til sig selv.
//
// LYNGBYS BÅND STOD HER OG ER FJERNET IGEN — det var i den forkerte enhed.
// Tallet 2,8 % er båndets bredde som andel af trøjens HØJDE (deraf "0,61 px
// ved 22 px"), ikke farve nr. 2's andel af FLADEN. Det blev alligevel fodret
// ind som `pct2` og brugte til at binde `GULV_PCT` nedadtil. Var båndets
// areal i virkeligheden 13 %, ville gulvet ikke skille det fra Brøndbys, og
// testen ville stadig have været grøn — altså præcis den påstand, filen blev
// skrevet for at sikre ("bundet i begge ender"), målt med en tommestok i den
// ene ende og et termometer i den anden.
//
// Der findes desuden slet ingen Lyngby-post i `MAALINGER`s mønsterliste, så
// `kontrast: 9.0` var et tal, intet script nogensinde har udskrevet.
// Gulvet bindes nu nedadtil af Brøndbys bronzemønster på 1,9 %, som ER et
// ægte arealtal fra harnesset.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  bestaarTofarvet, assertSlags, erTofarvet, GULV_PCT, KONTRAST_ENKELTFIGUR, HALVDEL,
} from './troejeMoenster.mjs';

// slags, andel af flade, kontrast, nr.2 som brøk af nr.1
const MAALT = {
  'Randers skråbånd': { slags: 'enkeltfigur', pct2: 21.3, kontrast: 6.18, andel2: 21.3 / 78.7 },
  'Randers kvarterer': { slags: 'enkeltfigur', pct2: 47.1, kontrast: 5.49, andel2: 47.1 / 52.9 },
  'Brøndby brystbånd': { slags: 'enkeltfigur', pct2: 15.9, kontrast: 8.32, andel2: 15.9 / 84.1 },
  // Et SKAKBRÆT gentager sig ud over kroppen og dømmes derfor på areal —
  // ikke på kontrast. Den lå som `enkeltfigur`, indtil reglen blev skrevet ned.
  'OB tern': { slags: 'striber', pct2: 28.2, kontrast: 1.12, andel2: 28.2 / 71.8 },
  'Brøndby bronze': { slags: 'striber', pct2: 1.9, kontrast: 1.70, andel2: 1.9 / 98.1 },
  'Randers gitter': { slags: 'striber', pct2: 16.5, kontrast: 3.17, andel2: 16.5 / 83.5 },
};

describe('tofarvet-testen på de seks målte mønstre', () => {
  it.each([
    ['Randers skråbånd', true],
    ['Randers kvarterer', true],
    ['Brøndby brystbånd', true],
    ['OB tern', false],
    ['Brøndby bronze', false],
    ['Randers gitter', false],
  ])('%s → %s', (navn, forventet) => {
    expect(bestaarTofarvet(MAALT[navn]).bestaar).toBe(forventet);
  });

  // …og listen skal være UDTØMMENDE. Uden det kunne en måling forsvinde fra
  // MAALT, uden at nogen test blev rød — og så ville tabellen i
  // superligaTeams2026.js beskrive flere trøjer, end der er dækket her.
  it('dækker præcis de seks mønstre, harnesset måler', () => {
    expect(Object.keys(MAALT).sort()).toEqual([
      'Brøndby bronze', 'Brøndby brystbånd', 'OB tern',
      'Randers gitter', 'Randers kvarterer', 'Randers skråbånd',
    ]);
  });

  // HVER SKAL FALDE PÅ DEN RIGTIGE GRUND. Uden det ville en test, der bare
  // tæller tre beståede, bestå selv om OB faldt på kontrasten i stedet for på
  // arealet. Det er ikke hypotetisk: kommentarerne fem steder i repoet SAGDE,
  // at OB falder på kontrasten (1,12:1), længe efter reglen dømte den på areal.
  it.each([
    ['OB tern', /50 %/],
    ['Brøndby bronze', /gulvet/],
    ['Randers gitter', /50 %/],
  ])('%s falder med en grund, der nævner %s', (navn, moenster) => {
    expect(bestaarTofarvet(MAALT[navn]).grund).toMatch(moenster);
  });
});

describe('tærsklerne selv', () => {
  // INGEN MÅLT TRØJE FALDER PÅ KONTRASTEN. OB's tern er et skakbræt og falder
  // på areal. Kontrastkravet er en vagt mod en FREMTIDIG enkeltfigur i to
  // næsten ens farver — og den skal stadig virke, så den prøves med OB's tal
  // sat til `enkeltfigur`. Det er den ene syntetiske case i filen, og den er
  // det, fordi virkeligheden ikke har leveret en endnu.
  it('ville afvise en enkeltfigur med OB-farvernes kontrast', () => {
    const somEnkeltfigur = { ...MAALT['OB tern'], slags: 'enkeltfigur' };
    expect(bestaarTofarvet(somEnkeltfigur).bestaar).toBe(false);
    expect(bestaarTofarvet(somEnkeltfigur).grund).toMatch(/kontrast/);
    expect(KONTRAST_ENKELTFIGUR).toBeGreaterThan(MAALT['OB tern'].kontrast);
  });

  it('ligger under den laveste enkeltfigur, der SKAL bestå', () => {
    const laveste = Math.min(
      MAALT['Randers skråbånd'].kontrast,
      MAALT['Randers kvarterer'].kontrast,
      MAALT['Brøndby brystbånd'].kontrast,
    );
    expect(KONTRAST_ENKELTFIGUR).toBeLessThan(laveste);
  });

  // GULVET ER BUNDET I BEGGE ENDER — og begge tal er nu AREAL, målt af samme
  // harness. Nedadtil af Brøndbys bronzemønster (1,9 %), som skal falde;
  // opadtil af Brøndbys brystbånd (15,9 %), som skal bestå. Før stod Lyngbys
  // 2,8 % i den nedre ende, og det tal er en andel af trøjens HØJDE.
  it('har et gulv, der skiller Brøndbys bronze fra Brøndbys bånd', () => {
    expect(GULV_PCT).toBeGreaterThan(MAALT['Brøndby bronze'].pct2);
    expect(GULV_PCT).toBeLessThan(MAALT['Brøndby brystbånd'].pct2);
  });

  // SLAGSEN AFGØR UDFALDET, og derfor skal reglen for den stå skrevet i
  // troejeMoenster.mjs. Samme tal, to slags: Brøndbys brystbånd består som
  // enkeltfigur og ville FALDE som striber. Det er hele grunden til, at testen
  // blev delt i to — uden skelnen stod trøjen ensfarvet.
  it('giver forskelligt svar for samme tal, alt efter slags', () => {
    const tal = MAALT['Brøndby brystbånd'];
    expect(bestaarTofarvet({ ...tal, slags: 'enkeltfigur' }).bestaar).toBe(true);
    expect(bestaarTofarvet({ ...tal, slags: 'striber' }).bestaar).toBe(false);
  });

  // Og modsat: en ægte stribet trøje skal bestå som striber. Sønderjyskes
  // hvide striber har lav kontrast (1,55:1) og ville falde som enkeltfigur —
  // men de er striber, og striber dømmes på areal.
  it('lader ægte striber bestå på areal, ikke kontrast', () => {
    const soenderjyske = { slags: 'striber', pct2: 40, kontrast: 1.55, andel2: 40 / 60 };
    expect(bestaarTofarvet(soenderjyske).bestaar).toBe(true);
    expect(bestaarTofarvet({ ...soenderjyske, slags: 'enkeltfigur' }).bestaar).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// `slags` MÅ IKKE KUNNE SÆTTES VED ET UHELD.
//
// Den var før valgfri, og alt der ikke var præcis `'enkeltfigur'` blev
// stiltiende til striber. Testen ovenfor viser, at de to slags giver MODSAT
// svar på de samme tal — så et glemt felt eller en tastefejl vendte udfaldet
// uden en lyd. Det er den vigtigste knap i beslutningen.
// ---------------------------------------------------------------------------
describe('slags skal stå, og skal være en af de to', () => {
  it.each([undefined, null, '', 'enkelfigur', 'Enkeltfigur', 'stribet', 0])(
    'kaster på %p',
    (daarlig) => {
      expect(() => assertSlags(daarlig)).toThrow(/slags skal være/);
      expect(() => bestaarTofarvet({
        slags: daarlig, pct2: 21.3, kontrast: 6.18, andel2: 0.27,
      })).toThrow(/slags skal være/);
    },
  );

  it.each(['striber', 'enkeltfigur'])('accepterer %s', (god) => {
    expect(assertSlags(god)).toBe(god);
  });

  // MODPRØVEN: en tastefejl gav før det MODSATTE svar, ikke en fejl. Randers'
  // skråbånd med `slags: 'enkelfigur'` ville være faldet som striber (21,3 %
  // er kun 27 % af nr. 1), og trøjen var stået ensfarvet.
  it('ville ellers have vendt Randers skråbånd til ensfarvet', () => {
    const tal = MAALT['Randers skråbånd'];
    expect(bestaarTofarvet({ ...tal, slags: 'striber' }).bestaar).toBe(false);
    expect(bestaarTofarvet(tal).bestaar).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEN UDELTE TEST — de to ældre scripts' udgave, nu med de samme tal.
//
// Den fandtes i tre eksemplarer med bare tal (`0.12`, `0.5`): her, i
// `superliga-troejefarver.mjs` og i `troejefarver()` i
// `holdfarver-wikipedia.mjs`. Kun det ene var testet. De to andre importerer
// nu `erTofarvet`, så en ændring af gulvet rammer alle tre steder.
// ---------------------------------------------------------------------------
describe('erTofarvet — den udelte test, de to ældre scripts bruger', () => {
  const fl = (...andele) => andele.map((andel, i) => ({ andel, hex: `#00000${i}` }));

  // Leeds' pinstriber: en tynd stribe under gulvet gør trøjen ensfarvet.
  // Det er DEN dom, hele den gamle test blev skrevet for.
  it('gør Leeds-agtige pinstriber ensfarvede', () => {
    expect(erTofarvet(fl(0.94, 0.06))).toBe(false);
  });

  // En ægte stribet trøje: to store flader, nr. 2 over halvdelen af nr. 1.
  it('lader to store flader tælle som tofarvet', () => {
    expect(erTofarvet(fl(0.58, 0.42))).toBe(true);
  });

  // …og en trøje med et stort mærke: fladen er over gulvet, men langt under
  // halvdelen. Uden halvdel-kravet ville den stå stribet.
  it('afviser en stor flade, der ikke når halvdelen', () => {
    expect(erTofarvet(fl(0.7, 0.14))).toBe(false);
    expect(GULV_PCT / 100).toBeLessThan(0.14);
  });

  // GRÆNSERNE ER DE SAMME TAL som den delte tests. Uden det kunne gulvet
  // flyttes i troejeMoenster.mjs, mens de to scripts blev stående på 12 %.
  it('bruger GULV_PCT og HALVDEL, ikke sine egne tal', () => {
    const lige = GULV_PCT / 100;
    expect(erTofarvet(fl(1 - lige, lige))).toBe(false); // præcis på gulvet, men under halvdelen
    expect(erTofarvet(fl(0.6, 0.6 * HALVDEL))).toBe(true); // præcis på halvdelen
    expect(erTofarvet(fl(0.6, 0.6 * HALVDEL - 0.001))).toBe(false);
  });
});

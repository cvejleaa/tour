// ---------------------------------------------------------------------------
// Tofarvet-testen — den beslutning, der afgør hvilke trøjer der bærer mønster.
//
// Den lå inline i `superliga-ude-tredje.mjs` og var HELT udækket: tærsklen
// kunne sættes fra 2 til 1, så OB's tern på 1,12:1 ville stå som "BESTÅR", med
// alle 2022 tests grønne. Samme hul som `holdfarver-wikipedia.mjs` havde.
//
// TALLENE ER DE SYV FAKTISK MÅLTE TRØJER, ikke opfundne eksempler. Kører man
// `node scripts/superliga-ude-tredje.mjs --moenster`, kommer præcis de her tal
// ud, og de står også i kommentaren i `superligaTeams2026.js`. Så er testen
// bundet til virkeligheden og ikke til sig selv.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { bestaarTofarvet, GULV_PCT, KONTRAST_ENKELTFIGUR } from './troejeMoenster.mjs';

// slags, andel af flade, kontrast, nr.2 som brøk af nr.1
const MAALT = {
  'Randers skråbånd': { slags: 'enkeltfigur', pct2: 21.3, kontrast: 6.18, andel2: 21.3 / 78.7 },
  'Randers kvarterer': { slags: 'enkeltfigur', pct2: 47.1, kontrast: 5.49, andel2: 47.1 / 52.9 },
  'Brøndby brystbånd': { slags: 'enkeltfigur', pct2: 15.9, kontrast: 8.32, andel2: 15.9 / 84.1 },
  'OB tern': { slags: 'enkeltfigur', pct2: 28.2, kontrast: 1.12, andel2: 28.2 / 71.8 },
  'Lyngby bånd': { slags: 'enkeltfigur', pct2: 2.8, kontrast: 9.0, andel2: 2.8 / 97.2 },
  'Brøndby bronze': { slags: 'striber', pct2: 1.9, kontrast: 1.70, andel2: 1.9 / 98.1 },
  'Randers gitter': { slags: 'striber', pct2: 16.5, kontrast: 3.17, andel2: 16.5 / 83.5 },
};

describe('tofarvet-testen på de syv målte trøjer', () => {
  it.each([
    ['Randers skråbånd', true],
    ['Randers kvarterer', true],
    ['Brøndby brystbånd', true],
    ['OB tern', false],
    ['Lyngby bånd', false],
    ['Brøndby bronze', false],
    ['Randers gitter', false],
  ])('%s → %s', (navn, forventet) => {
    expect(bestaarTofarvet(MAALT[navn]).bestaar).toBe(forventet);
  });

  // HVER SKAL FALDE PÅ DEN RIGTIGE GRUND. Uden det ville en test, der bare
  // tæller tre beståede, bestå selv om Lyngby faldt på kontrast og OB på areal.
  it.each([
    ['OB tern', /kontrast/],
    ['Lyngby bånd', /gulvet/],
    ['Brøndby bronze', /gulvet/],
    ['Randers gitter', /50 %/],
  ])('%s falder med en grund, der nævner %s', (navn, moenster) => {
    expect(bestaarTofarvet(MAALT[navn]).grund).toMatch(moenster);
  });
});

describe('tærsklerne selv', () => {
  // BÆRENDE. Sættes kontrast-kravet til 1, ville OB's tern bestå — og badgen
  // ville tegne lyserødt på lyserødt. Sættes det over 5,49, falder Randers'
  // kvarterer, som tydeligt kan ses. Testen binder begge ender.
  it('afviser OB ved den gældende tærskel og accepterer ved en lavere', () => {
    const ob = MAALT['OB tern'];
    expect(bestaarTofarvet(ob).bestaar).toBe(false);
    expect(KONTRAST_ENKELTFIGUR).toBeGreaterThan(ob.kontrast);
  });

  it('ligger under den laveste enkeltfigur, der SKAL bestå', () => {
    const laveste = Math.min(
      MAALT['Randers skråbånd'].kontrast,
      MAALT['Randers kvarterer'].kontrast,
      MAALT['Brøndby brystbånd'].kontrast,
    );
    expect(KONTRAST_ENKELTFIGUR).toBeLessThan(laveste);
  });

  // Gulvet skal ligge mellem Lyngbys 2,8 % og Brøndby-båndets 15,9 %.
  it('har et gulv, der skiller Lyngbys bånd fra Brøndbys', () => {
    expect(GULV_PCT).toBeGreaterThan(MAALT['Lyngby bånd'].pct2);
    expect(GULV_PCT).toBeLessThan(MAALT['Brøndby brystbånd'].pct2);
  });

  // SLAGSEN AFGØR UDFALDET. Samme tal, to slags: Brøndbys brystbånd består som
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

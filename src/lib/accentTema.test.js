// ---------------------------------------------------------------------------
// TESTS FOR ACCENT-TEMAET.
//
// EN TING AT VIDE OM MÅDEN, DE ER SKREVET PÅ. Kravene og fladerne står som
// konstanter i accentTema.js (KRAV_BLAEK, SIDEFLADER.moerkt.haardeste …), og
// hvis testene MÅLTE med de samme konstanter, ville en mutation af dem flytte
// både koden og målestokken — og suiten blive grøn. Det er præcis den fælde,
// "én vagt pr. sikkerhedsregel" handler om.
//
// Derfor står tallene HER skrevet ud i hånden: 4.5, '#202a34', '#ffffff'. To
// steder, der skal være enige, men som ikke kan ændres i ét greb.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  accentTema, temaFund, temaStil, juster, bedsteBlaek, skygge, bland,
  hexTilHsl, hslTilHex, KRAV_BLAEK, SIDEFLADER, TEMA_VARIABLE,
} from './accentTema';
import { kontrast, kuloer, relativLuminans } from './contrastText';
import { TEAM_THEMES } from '../data/teamThemes';
import { SUPERLIGA_TEAMS_2026 } from '../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../data/premierLeagueTeams2026';

describe('farverum', () => {
  it('hsl frem og tilbage rammer samme farve', () => {
    for (const hex of ['#0b6e4f', '#E5B905', '#022592', '#ffffff', '#000000', '#7f7f7f']) {
      const [h, s, l] = hexTilHsl(hex);
      expect(hslTilHex(h, s, l).toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  it('bland regner som CSS color-mix i srgb', () => {
    expect(bland('#000000', '#ffffff', 50)).toBe('#808080');
    expect(bland('#ff0000', '#ffffff', 10)).toBe('#ffe6e6');
    // 0 % = ingen accent overhovedet; 100 % = kun accenten.
    expect(bland('#ff0000', '#00ff00', 0)).toBe('#00ff00');
    expect(bland('#ff0000', '#00ff00', 100)).toBe('#ff0000');
  });
});

describe('juster', () => {
  it('flytter kun lysheden — kulørtone og mætning står stille', () => {
    const ind = '#E5B905';
    const ud = juster(ind, '#ffffff', 4.5, -1);
    const [h1, s1] = hexTilHsl(ind);
    const [h2, s2] = hexTilHsl(ud);
    expect(Math.abs(h1 - h2)).toBeLessThan(2);
    expect(Math.abs(s1 - s2)).toBeLessThan(2);
    // …og den er faktisk blevet mørkere, ikke bare "en anden farve".
    expect(relativLuminans(ud)).toBeLessThan(relativLuminans(ind));
  });

  it('stopper det FØRSTE sted, kravet er opfyldt', () => {
    // Ellers ville alle temaer ende sorte eller hvide. Brøndby-gul rammer
    // 4,5:1 mod hvid ved #8b7003 — ét trin lysere (#8d7203) gør det ikke.
    const ud = juster('#E5B905', '#ffffff', 4.5, -1);
    expect(ud).toBe('#8b7003');
    expect(kontrast(ud, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    const [h, s, l] = hexTilHsl(ud);
    expect(kontrast(hslTilHex(h, s, l + 1), '#ffffff')).toBeLessThan(4.5);
  });

  it('rører ikke en farve, der allerede opfylder kravet', () => {
    expect(juster('#022592', '#ffffff', 4.5, -1)).toBe('#022592');
  });
});

describe('bedsteBlaek', () => {
  it('vælger det blæk, der MÅLER bedst — ikke det, der ligner', () => {
    expect(bedsteBlaek('#E5B905')).toBe('#10151b'); // gul: mørkt blæk
    expect(bedsteBlaek('#022592')).toBe('#ffffff'); // marineblå: hvidt blæk
  });

  it('giver mindst 4,5:1 på alle de flader, accentTema selv laver', () => {
    for (const t of TEAM_THEMES) {
      for (const mode of ['lyst', 'moerkt']) {
        const tema = accentTema(t.primary, mode);
        expect(kontrast(tema.onPitch, tema.pitch)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('skygge', () => {
  it('skubber VÆK fra blækket i begge retninger', () => {
    // Hvidt blæk → fladen mørknes. Mørkt blæk → den lysnes. Skubbede den altid
    // nedad (som navnet --c-pitch-dark antyder), ville et lyst tema få mørk
    // tekst på en flade, der blev ved med at nærme sig teksten.
    expect(relativLuminans(skygge('#0b6e4f', '#ffffff'))).toBeLessThan(relativLuminans('#0b6e4f'));
    expect(relativLuminans(skygge('#e5b905', '#10151b'))).toBeGreaterThan(relativLuminans('#e5b905'));
  });
});

describe('accentTema', () => {
  // ── B1: MOD HVILKEN FLADE MÅLES DER ────────────────────────────────────────
  // Blækket står på et KORT, ikke på sidebaggrunden. I mørkt tema er den
  // sværeste flade --c-surface-2 (#202a34), ikke --c-bg (#0e1419).
  it('måler mod den hårdeste flade, ikke mod sidebaggrunden', () => {
    const t = accentTema('#022592', 'moerkt'); // Lyngby
    expect(t.pitch).toBe('#688cfd');
    expect(kontrast(t.pitch, '#202a34')).toBeGreaterThanOrEqual(4.5);
    // MÅLT MOD --c-bg I STEDET ville udledningen stoppe ved #4a75fd, som på
    // egen-rækken i stillingen kun giver 3,64:1. Den her linje er hele B1:
    expect(kontrast('#4a75fd', '#202a34')).toBeLessThan(4.5);
    expect(kontrast('#4a75fd', '#202a34')).toBeCloseTo(3.64, 1);
  });

  // ── B2: TO KRAV, IKKE ÉT ───────────────────────────────────────────────────
  it('giver de lyse klubfarver MØRKT blæk på fladen', () => {
    // Sønderjyske, Horsens, Brøndby og Randers fik alle hvid tekst på en lys
    // flade: 1,53 / 1,68 / 1,86 / 1,91:1. Hvid er nu udelukket, fordi blækket
    // måles i stedet for at blive valgt.
    for (const [navn, farve, hvidFoer] of [
      ['Sønderjyske', '#B3D6E9', 1.53], ['Horsens', '#E8C45C', 1.68],
      ['Brøndby', '#E5B905', 1.86], ['Randers', '#78C5ED', 1.91],
    ]) {
      const t = accentTema(farve, 'moerkt');
      expect(t.pitch, navn).toBe(farve.toLowerCase());
      expect(t.onPitch, navn).toBe('#10151b');
      expect(kontrast(t.onPitch, t.pitch), navn).toBeGreaterThanOrEqual(4.5);
      // …og det er stadig sandt, at hvid ville have været ulæselig.
      expect(kontrast('#ffffff', t.pitch), navn).toBeCloseTo(hvidFoer, 1);
    }
  });

  it('holder fladen synlig mod sidebaggrunden (1.4.11)', () => {
    for (const [farve, mode, bg] of [['#009639', 'lyst', '#f7f9fb'], ['#0033A0', 'moerkt', '#0e1419']]) {
      const t = accentTema(farve, mode);
      expect(kontrast(t.pitch, bg)).toBeGreaterThanOrEqual(3);
      expect(kontrast(t.pitchDark, bg)).toBeGreaterThanOrEqual(3);
    }
    // Movistar stod før på 1,75:1 mod den mørke sidebaggrund — usynlig knap.
    expect(kontrast('#0033A0', '#0e1419')).toBeLessThan(3);
  });

  it('hover-fladen bærer det SAMME blæk som fladen', () => {
    // astana faldt før på 3,88:1 her, fordi --c-pitch-dark var blandet i hånden
    // uden at nogen målte blækket ovenpå.
    for (const t of TEAM_THEMES) {
      for (const mode of ['lyst', 'moerkt']) {
        const tema = accentTema(t.primary, mode);
        expect(kontrast(tema.onPitch, tema.pitchDark), `${t.key}/${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Målt mod '#111111' — den værdi, blokken i theme.css faktisk skrev som
    // --c-on-pitch for astana. (Mod vores eget mørke blæk #10151b er tallet
    // 3,77; det er den gamle CSS, der skal måles, ikke den nye konstant.)
    expect(kontrast('#0079aa', '#111111')).toBeCloseTo(3.88, 1);
  });

  // ── B3: WEAK OG TINT FANDTES IKKE ──────────────────────────────────────────
  it('laver svage flader, der kan bære deres egen tekst', () => {
    for (const mode of ['lyst', 'moerkt']) {
      const f = SIDEFLADER[mode];
      for (const t of SUPERLIGA_TEAMS_2026) {
        const tema = accentTema(t.color, mode);
        expect(kontrast(tema.pitch, tema.pitchWeak), `${t.name}/${mode}`).toBeGreaterThanOrEqual(4.5);
        expect(kontrast(f.tekst, tema.pitchTint), `${t.name}/${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // FALLBACKEN, DER BLEV BRUGT FØR: #eef7f1 er næsten hvid, og i mørkt tema
    // stod --c-pitch-blækket på 1,40-1,70:1 mod den. Tallene for Sønderjyske,
    // Horsens og Brøndby, som QC fandt dem:
    expect(kontrast('#B3D6E9', '#eef7f1')).toBeCloseTo(1.40, 1);
    expect(kontrast('#E8C45C', '#eef7f1')).toBeCloseTo(1.54, 1);
    expect(kontrast('#E5B905', '#eef7f1')).toBeCloseTo(1.70, 1);
  });

  it('dropper tonen helt, hvis den ikke kan bæres', () => {
    // Sønderjyske i LYST tema: fladen ligger på 4,61:1 mod hvid, så selv 2 %
    // tone ville skubbe blækket under 4,5. Så bliver den hvid — ingen tone er
    // bedre end en, der ikke kan læses. Rubrikken kendes stadig på sin ramme.
    const t = accentTema('#B3D6E9', 'lyst');
    expect(t.pitchWeak).toBe('#ffffff');
    expect(kontrast(t.pitch, t.pitchWeak)).toBeGreaterThanOrEqual(4.5);
  });

  it('afviser et ukendt basistema i stedet for at gætte', () => {
    expect(() => accentTema('#0b6e4f', 'dark')).toThrow(/Ukendt tema/);
  });
});

describe('temaFund', () => {
  // DEN HER ER MUTATIONSMÅLET FOR SELVE TÆRSKLERNE. Sænkes KRAV_BLAEK til 3,
  // holder `accentTema`s egne tal stadig (de er skrevet ud i testene ovenfor),
  // men de gamle temaer holder OP med at falde — og så bliver den her rød.
  it('finder præcis det, der var galt med de gamle, håndholdte temaer', () => {
    const movistar = {
      pitch: '#0033A0', pitchDark: '#002677', onPitch: '#ffffff',
      pitchWeak: '#eef7f1', pitchTint: '#eef7f1',
    };
    const fund = temaFund(movistar, 'moerkt');
    expect(fund.join(' | ')).toContain('blæk på hårdeste flade: 1.37');
    expect(fund.join(' | ')).toContain('flade mod sidebaggrund: 1.75');
    expect(fund.join(' | ')).toContain('tekst på pitch-tint: 1.02');
    expect(fund).toHaveLength(5);
  });

  it('siger god for et tema, der er regnet ud', () => {
    expect(temaFund(accentTema('#0033A0', 'moerkt'), 'moerkt')).toEqual([]);
  });

  it('KRAV_BLAEK er 4,5 — WCAG AA, ikke 3', () => {
    // Den eksisterende test i TeamThemePicker.test.jsx krævede >= 3. Baren var
    // sat så lavt, at den ville have godkendt næsten alt det, der var galt.
    expect(KRAV_BLAEK).toBe(4.5);
  });
});

describe('paritet: hvert hold i hvert basistema', () => {
  const HOLD = [
    ...TEAM_THEMES.map((t) => [`tour/${t.key}`, t.primary]),
    ...SUPERLIGA_TEAMS_2026.flatMap((t) => [t.color, t.awayColor, t.thirdColor]
      .filter((f) => f && kuloer(f) >= 0.1).slice(0, 1).map((f) => [`sl/${t.name}`, f])),
    ...PREMIER_LEAGUE_TEAMS_2026.flatMap((t) => [t.color, t.awayColor, t.thirdColor]
      .filter((f) => f && kuloer(f) >= 0.1).slice(0, 1).map((f) => [`pl/${t.name}`, f])),
    ['app', '#0b6e4f'],
  ];

  it('dækker alle hold — også de nye, hvis listen vokser', () => {
    // 23 Tour + 12 Superliga + 19 PL (Crystal Palace har ingen kulør) + appen.
    expect(HOLD).toHaveLength(55);
  });

  it('består alle krav i både lyst og mørkt', () => {
    const faldne = [];
    for (const [navn, farve] of HOLD) {
      for (const mode of ['lyst', 'moerkt']) {
        const fund = temaFund(accentTema(farve, mode), mode);
        if (fund.length) faldne.push(`${navn}/${mode}: ${fund.join('; ')}`);
      }
    }
    expect(faldne).toEqual([]);
  });
});

describe('temaStil', () => {
  it('navngiver alle fem variabler, som CSS bruger dem', () => {
    const stil = temaStil(accentTema('#E5B905', 'lyst'));
    expect(Object.keys(stil).sort()).toEqual([
      '--c-on-pitch', '--c-pitch', '--c-pitch-dark', '--c-pitch-tint', '--c-pitch-weak',
    ]);
    expect(stil['--c-pitch']).toBe('#8b7003');
    expect(Object.keys(TEMA_VARIABLE)).toHaveLength(5);
  });
});

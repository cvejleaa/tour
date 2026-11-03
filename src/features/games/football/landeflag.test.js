// ---------------------------------------------------------------------------
// LANDEFLAGENE — bundtet, evnen og hvor den regnes.
//
// Tre ting kan gå galt tavst, og hver har sin test:
//   1. Bundtet og evnen er to lister (landeflag.js importerer svg'er,
//      landeflagKoder.js er ren og læses af node). Driver de fra hinanden,
//      siger tør-kørslen «32 af 32», mens et flag mangler på skærmen.
//   2. Alt-eller-intet: et spil, hvor ét hold mangler, må ikke vise flag
//      nogen steder — ellers blander en kolonne flag og trøjer.
//   3. `flag` må kun komme fra bundtet, aldrig fra data: feltet ender i
//      <img src>, og et `flag` i spil-dokumentet ville være et kald til en
//      vilkårlig vært.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LANDEFLAG, flagSrc, medLandeflag } from './landeflag';
import { LANDEFLAG_KODER, harFlagKode, antalMedLandeflag, alleHarLandeflag } from './landeflagKoder';
import { teamsOf, harLandeflag, teamInfo } from './teamInfo';
import { HAANDBOLD_VM2027_HOLD } from '../../../data/haandboldVm2027Hold';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';

const HVM = { id: 'hvm2027', type: 'football', teams: HAANDBOLD_VM2027_HOLD };
const udenEn = (navn) => HAANDBOLD_VM2027_HOLD.map((t) => (
  t.name === navn ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'iso2')) : t
));

describe('bundtet og evnen er samme liste', () => {
  it('LANDEFLAG har præcis LANDEFLAG_KODER som nøgler', () => {
    expect(Object.keys(LANDEFLAG).sort()).toEqual([...LANDEFLAG_KODER].sort());
    expect(LANDEFLAG_KODER).toHaveLength(32);
  });

  // PLANENS USIKKERHED §8.4: at en .svg-import fra node_modules giver en
  // brugbar streng i vitest. Gør den ikke, kan ingen flade-test bære sin
  // src-assertion — så den efterprøves først, her.
  it('hver import er en ikke-tom URL til netop sit eget flag', () => {
    for (const k of LANDEFLAG_KODER) {
      expect(typeof LANDEFLAG[k], k).toBe('string');
      expect(LANDEFLAG[k], k).toMatch(new RegExp(`/${k}\\.svg$`));
    }
  });

  it('er frosset', () => {
    expect(Object.isFrozen(LANDEFLAG)).toBe(true);
    expect(Object.isFrozen(LANDEFLAG_KODER)).toBe(true);
  });
});

// SVG-FILERNE ER DOKUMENTER PÅ VORES EGET DOMÆNE (Security på koden).
// <img> stopper script inde i siden, men et direkte link til
// /assets/<hash>.svg åbner filen som dokument på tip.vejleaa.dk, og
// firebase.json har ingen CSP. I dag er alle 32 rene — men ingen test så
// efter, og et udvidet flagsæt eller en ny pakkeversion ville gå tavst
// igennem. Scanningen læser de PRÆCISE filer, landeflag.js importerer.
const FARLIGT = /<script|\son[a-z]+\s*=|foreignObject|<image|<style|data:|javascript:|href\s*=\s*"[^#]/i;

describe('flagfilerne indeholder intet aktivt', () => {
  const kilde = readFileSync(resolve(process.cwd(), 'src/features/games/football/landeflag.js'), 'utf8');
  const stier = [...kilde.matchAll(/^import \w+ from '(flag-icons\/[^']+\.svg)';$/gm)].map((m) => m[1]);

  it('scanner netop de 32 importerede filer', () => {
    expect(stier).toHaveLength(32);
    expect(stier.map((s) => s.match(/\/(\w+)\.svg$/)[1]).sort()).toEqual([...LANDEFLAG_KODER].sort());
  });

  // Kontrol: mønsteret kan faktisk se de former, det skal fange — ellers
  // er «ingen fund» nedenfor intet bevis.
  it.each([
    '<script>alert(1)</script>', '<svg onload="x()">', '<foreignObject>', '<image href="x"/>',
    '<style>@import</style>', 'href="data:text/html,x"', '<a href="https://ond.example">',
    '<a xlink:href="javascript:x">',
  ])('mønsteret fanger %p', (ond) => {
    expect(ond).toMatch(FARLIGT);
  });

  it('mønsteret lader flagenes egne interne henvisninger være', () => {
    expect('<use xlink:href="#a"/><path fill="url(#b)"/>').not.toMatch(FARLIGT);
  });

  it('ingen fil har script, hændelser, fremmedobjekter eller eksterne henvisninger', () => {
    for (const sti of stier) {
      const svg = readFileSync(resolve(process.cwd(), 'node_modules', sti), 'utf8');
      expect(svg.startsWith('<svg'), sti).toBe(true);
      expect(svg, sti).not.toMatch(FARLIGT);
    }
  });
});

describe('flagSrc / harFlagKode', () => {
  it('giver URL for en bundtet kode', () => {
    expect(flagSrc('dk')).toBe(LANDEFLAG.dk);
    expect(harFlagKode('dk')).toBe(true);
  });

  // Prototype-navne må aldrig svare ja — et objekt-opslag ville give en
  // funktion som src.
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('afviser %p', (k) => {
    expect(flagSrc(k)).toBeNull();
    expect(harFlagKode(k)).toBe(false);
  });

  // STORE BOGSTAVER AFVISES MED VILJE: feltet matches aldrig mod en kilde, så
  // 'DK' i holdfilen er en tastefejl, der skal ses — ikke normaliseres væk.
  it.each(['DK', 'Dk', 'dnk', 'gb-eng', 'xx', '', null, undefined, 7])('afviser %p', (k) => {
    expect(flagSrc(k)).toBeNull();
    expect(harFlagKode(k)).toBe(false);
  });
});

describe('alt eller intet', () => {
  it('sand for håndbold-VM\'ets 32 hold', () => {
    expect(alleHarLandeflag(HAANDBOLD_VM2027_HOLD)).toBe(true);
    expect(antalMedLandeflag(HAANDBOLD_VM2027_HOLD)).toBe(32);
  });

  // BÆRENDE: mutationen every→some (eller `> 0` i stedet for `=== length`)
  // skal være rød. 31 af 32 er INGEN flag.
  it('falsk, når ét af 32 mangler iso2 — og når ét har en ugyldig kode', () => {
    expect(alleHarLandeflag(udenEn('Japan'))).toBe(false);
    expect(antalMedLandeflag(udenEn('Japan'))).toBe(31);
    const stor = HAANDBOLD_VM2027_HOLD.map((t) => (t.name === 'Danmark' ? { ...t, iso2: 'DK' } : t));
    expect(alleHarLandeflag(stor)).toBe(false);
  });

  it('falsk for en tom liste, ingen liste og Superligaen', () => {
    expect(alleHarLandeflag([])).toBe(false);
    expect(alleHarLandeflag(null)).toBe(false);
    expect(alleHarLandeflag(undefined)).toBe(false);
    expect(alleHarLandeflag(SUPERLIGA_TEAMS_2026)).toBe(false);
    expect(antalMedLandeflag(null)).toBe(0);
    expect(antalMedLandeflag(SUPERLIGA_TEAMS_2026)).toBe(0);
  });
});

describe('medLandeflag', () => {
  it('lægger flaget på hvert hold, når alle har et', () => {
    const ud = medLandeflag(HAANDBOLD_VM2027_HOLD);
    expect(ud).toHaveLength(32);
    for (const t of ud) expect(t.flag, t.name).toBe(LANDEFLAG[t.iso2]);
  });

  it('lægger INTET flag på, når ét hold mangler — heller ikke på de 31', () => {
    const ud = medLandeflag(udenEn('Japan'));
    expect(ud.filter((t) => t.flag)).toEqual([]);
  });

  // SIKKERHED: `flag` fra data må aldrig nå <img src>.
  it('overskriver et `flag` fra spil-dokumentet — i begge grene', () => {
    const ondt = 'https://tracker.example/x.png';
    const sl = medLandeflag(SUPERLIGA_TEAMS_2026.map((t) => ({ ...t, flag: ondt })));
    expect(sl.every((t) => t.flag === null)).toBe(true);
    const hvm = medLandeflag(HAANDBOLD_VM2027_HOLD.map((t) => ({ ...t, flag: ondt })));
    expect(hvm.find((t) => t.name === 'Danmark').flag).toBe(LANDEFLAG.dk);
    expect(hvm.some((t) => t.flag === ondt)).toBe(false);
  });

  it('giver SAMME array-objekt for samme liste (cachen)', () => {
    expect(medLandeflag(HAANDBOLD_VM2027_HOLD)).toBe(medLandeflag(HAANDBOLD_VM2027_HOLD));
    expect(medLandeflag(SUPERLIGA_TEAMS_2026)).toBe(medLandeflag(SUPERLIGA_TEAMS_2026));
  });

  it('lader en tom liste og en ikke-liste være', () => {
    const tom = [];
    expect(medLandeflag(tom)).toBe(tom);
    expect(medLandeflag(null)).toBeNull();
  });
});

describe('teamsOf / harLandeflag — evnen regnes ét sted', () => {
  it('teamsOf lægger flaget på (og visningsnavnet står der stadig)', () => {
    const dk = teamInfo(teamsOf(HVM), 'Danmark');
    expect(dk.flag).toBe(LANDEFLAG.dk);
    expect(dk.vis).toBe('Danmark');
  });

  // useMemo-afhængighederne hænger på, at samme spil giver samme array.
  it('teamsOf giver samme array-objekt igen — også med teamStyles', () => {
    expect(teamsOf(HVM)).toBe(teamsOf(HVM));
    const g = { ...HVM, teamStyles: { Danmark: { visningsnavn: 'DK' } } };
    expect(teamsOf(g)).toBe(teamsOf({ ...g, teamStyles: { Danmark: { visningsnavn: 'DK' } } }));
    expect(teamInfo(teamsOf(g), 'Danmark').vis).toBe('DK');
  });

  it('harLandeflag: sand for hvm2027, falsk når ét hold mangler', () => {
    expect(harLandeflag(HVM)).toBe(true);
    expect(harLandeflag({ ...HVM, teams: udenEn('Japan') })).toBe(false);
  });

  // DATA, ALDRIG SPORT. Et håndboldspil uden iso2 tegner trøjer, og et spil
  // med landskoder får flag uanset `sport`.
  it('gater på data, ikke på sport', () => {
    expect(harLandeflag({ type: 'football', sport: 'haandbold', teams: udenEn('Japan') })).toBe(false);
    expect(harLandeflag({ type: 'football', teams: HAANDBOLD_VM2027_HOLD })).toBe(true);
  });

  it('falsk for Superligaen og for et spil uden hold (fallback-listen)', () => {
    expect(harLandeflag({ type: 'football', teams: SUPERLIGA_TEAMS_2026 })).toBe(false);
    expect(harLandeflag({ type: 'football' })).toBe(false);
    expect(harLandeflag(null)).toBe(false);
  });
});

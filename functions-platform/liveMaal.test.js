import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const { liveMaalAf, LIVE_SKRIVBARE, ANNULLERET_IT } = require('./liveMaal');
const { SKRIVBARE_FELTER } = require('./kampDetaljer');

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/livescore-kampe.json', import.meta.url), 'utf8'));
const kamp = (eid) => {
  const k = FIXTURE.kampe.find((x) => x.Eid === eid);
  if (!k) throw new Error(`fixture mangler Eid ${eid}`);
  return k;
};
// 1793564: 2-2 med et ANNULLERET mål (IT 62, VAR) i 32. — og 1784439: 0-0,
// hvis eneste hændelse med stilling er et annulleret mål.
const TO_TO = kamp('1793564').incidents;
const NUL_NUL = kamp('1784439').incidents;
const EN_NUL = kamp('1784451').incidents;

describe('liveMaalAf — målene, bundet til VORES levende stilling', () => {
  it('skriver kæden, når kilden og vores live-stilling er enige', () => {
    const ud = liveMaalAf(EN_NUL, { home: 1, away: 0 });
    expect(ud.afvist).toBeUndefined();
    expect(ud.home).toBe(1);
    expect(ud.away).toBe(0);
    expect(ud.maal).toHaveLength(1);
    expect(ud.maal[0]).toMatchObject({ hold: 'home', selvmaal: false });
    expect(typeof ud.maal[0].minut).toBe('number');
    expect(ud.annullerede).toEqual([]);
  });

  it('UENIGHED om stillingen → intet — en liste, der modsiger tallet, er værre end ingen', () => {
    // Kilden siger 1-0, vores live siger 0-0 (bagud) eller 1-1 (foran).
    expect(liveMaalAf(EN_NUL, { home: 0, away: 0 })).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf(EN_NUL, { home: 1, away: 1 })).toEqual({ afvist: 'uenig' });
    // Pr. SIDE, ikke på totalen: 1-0 mod 0-1 er samme total og stadig uenig.
    expect(liveMaalAf(EN_NUL, { home: 0, away: 1 })).toEqual({ afvist: 'uenig' });
  });

  it('uden en brugbar stilling i en af enderne → uenig, aldrig et kast', () => {
    expect(liveMaalAf(EN_NUL, null)).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf(EN_NUL, { home: '1', away: null })).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf({ Tr1: null, Tr2: 0 }, { home: 0, away: 0 })).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf(null, { home: 0, away: 0 })).toEqual({ afvist: 'uenig' });
  });

  it('et ANNULLERET mål står for sig, markeret — og tæller ikke i kæden', () => {
    const ud = liveMaalAf(TO_TO, { home: 2, away: 2 });
    expect(ud.afvist).toBeUndefined();
    expect(ud.maal).toHaveLength(4);
    expect(ud.annullerede).toEqual([{ hold: 'home', minut: 32, scorer: 'Florian Wirtz' }]);
    // Den annullerede scorer må ikke også stå i den tællende liste i 32.
    expect(ud.maal.some((m) => m.minut === 32 && m.scorer === 'Florian Wirtz')).toBe(false);
  });

  it('en målløs kamp med et annulleret mål: tom kæde, én annulleret', () => {
    const ud = liveMaalAf(NUL_NUL, { home: 0, away: 0 });
    expect(ud.maal).toEqual([]);
    expect(ud.annullerede).toEqual([{ hold: 'away', minut: 7, scorer: 'Thomas Joergensen' }]);
  });

  it('en brudt kæde → uparset, selv om stillingen stemmer', () => {
    // Fjern målenes stillinger: Tr siger 1-0, men ingen hændelse bærer Sc.
    const uden = JSON.parse(JSON.stringify(EN_NUL));
    for (const liste of Object.values(uden.Incs || {})) for (const h of liste) delete h.Sc;
    expect(liveMaalAf(uden, { home: 1, away: 0 })).toEqual({ afvist: 'uparset' });
  });

  it('kæden tjekkes PR. SIDE — en brudt udekæde afviser, selv om hjemmekæden er hel', () => {
    // 2-2: fjern stillingen på UDE-målene alene. Hjemme 1..2 er ubrudt,
    // ude er tom mod 2 → uparset. Uden side-tjekket på ude ville totalen
    // eller hjemmekæden alene slippe listen igennem med to mål for lidt.
    // Stillingen sidder BÅDE på containeren og på under-hændelserne (36/63),
    // og maalAf læser dem alle — så begge lag skal strippes for siden.
    const udenSc = (inc, side) => {
      const kopi = JSON.parse(JSON.stringify(inc));
      const strip = (h) => { if (h.Nm === side) delete h.Sc; (h.Incs || []).forEach(strip); };
      for (const liste of Object.values(kopi.Incs || {})) liste.forEach(strip);
      return kopi;
    };
    expect(liveMaalAf(udenSc(TO_TO, 2), { home: 2, away: 2 })).toEqual({ afvist: 'uparset' });
    // Og spejlet: hjemme brudt, ude hel.
    expect(liveMaalAf(udenSc(TO_TO, 1), { home: 2, away: 2 })).toEqual({ afvist: 'uparset' });
  });

  it('en giftig post kaster ikke ud af regnedelen', () => {
    const gift = JSON.parse(JSON.stringify(TO_TO));
    gift.Incs['1'].push({ IT: ANNULLERET_IT, Nm: 1, Min: 40, Pn: { toString: null } });
    const ud = liveMaalAf(gift, { home: 2, away: 2 });
    expect(ud.annullerede.map((a) => a.minut)).toEqual([32, 40]);
    expect(ud.annullerede[1].scorer).toBeUndefined();
  });
});

describe('LIVE_SKRIVBARE — én vagt pr. skrivesti', () => {
  it('live-feltet står IKKE på facit-stiens liste, og facit-felterne står ikke på live-stiens', () => {
    expect(LIVE_SKRIVBARE).toEqual(['liveMaal']);
    expect(Object.isFrozen(LIVE_SKRIVBARE)).toBe(true);
    expect(SKRIVBARE_FELTER).not.toContain('liveMaal');
    for (const f of ['maal', 'result', 'homeGoals', 'awayGoals', 'kickoff']) expect(LIVE_SKRIVBARE).not.toContain(f);
  });
});

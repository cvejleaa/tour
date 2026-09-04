import { describe, it, expect } from 'vitest';
import { vagt, stabileNoegler, basislinjeDiff } from './flade-vagt.mjs';

const el = (o) => ({ fil: 'src/pages/A.jsx', linje: 1, kolonne: 1, tag: 'button', type: null, tekst: 'Gem', komponent: 'A', app: 'faelles', aktiveret: false, tests: [], ...o });

describe('stabileNoegler', () => {
  it('bruger ikke linjetal — en redigering ovenfor ændrer ikke nøglen — og nummererer identiske tupler', () => {
    const a = stabileNoegler([el({ linje: 10 }), el({ linje: 20 }), el({ linje: 30, tekst: 'Slet' })]);
    const b = stabileNoegler([el({ linje: 15 }), el({ linje: 25 }), el({ linje: 35, tekst: 'Slet' })]);
    expect(a).toEqual(b);
    expect(a).toEqual(['src/pages/A.jsx|A|button|Gem#1', 'src/pages/A.jsx|A|button|Gem#2', 'src/pages/A.jsx|A|button|Slet#1']);
  });
});

describe('basislinjeDiff — det, --opdater skal vise, før nogen committer', () => {
  it('nævner hver nøgle, der kommer til, og hver, der går ud', () => {
    expect(basislinjeDiff(['a', 'b'], ['b', 'c'])).toEqual({ til: ['c'], fra: ['a'] });
    expect(basislinjeDiff([], [])).toEqual({ til: [], fra: [] });
  });

  it('kendt begrænsning: en ny identisk knap FØR en kendt makker skrider nummereringen — diffen viser det som +#2', () => {
    // Før: én "Gem"-knap (#1) i basislinjen. Efter: en ny "Gem" indsat foran.
    // Den nye arver #1; den gamle bliver #2 og står som "til". Uden den
    // eksplicitte liste ville --opdater bage den nye knap ind uset.
    const foer = stabileNoegler([el({ linje: 10 })]);
    const efter = stabileNoegler([el({ linje: 5 }), el({ linje: 10 })]);
    expect(basislinjeDiff(foer, efter)).toEqual({ til: ['src/pages/A.jsx|A|button|Gem#2'], fra: [] });
  });
});

describe('vagt', () => {
  const ROERT = el({ linje: 1, tekst: 'Gem', aktiveret: true, tests: ['t'] });
  const KENDT = el({ linje: 2, tekst: 'Slet' });
  const KENDT_N = 'src/pages/A.jsx|A|button|Slet#1';

  it('grøn: kun kendte urørte, log ikke tom, ingen undtagelser', () => {
    const r = vagt([ROERT, KENDT], 5, [KENDT_N], []);
    expect(r.fejl).toEqual([]);
    expect(r.basislinjeNu).toEqual([KENDT_N]);
  });

  it('rød med fil:linje ved et NYT urørt element', () => {
    const r = vagt([ROERT, KENDT, el({ linje: 7, tekst: 'Ny knap' })], 5, [KENDT_N], []);
    expect(r.fejl).toHaveLength(1);
    expect(r.fejl[0]).toContain('src/pages/A.jsx:7');
    expect(r.fejl[0]).toContain('«Ny knap»');
    expect(r.fejl[0]).toContain('flade-undtagelser.json');
  });

  it('rød ved tom log — alt ville se urørt ud, og det er en fejl i kørslen', () => {
    const r = vagt([ROERT, KENDT, el({ linje: 7, tekst: 'Ny knap' })], 0, [KENDT_N], []);
    expect(r.fejl).toHaveLength(1);
    expect(r.fejl[0]).toMatch(/ingen interaktioner/);
  });

  it('rød når basislinjen kan skrumpe — den skal skrumpe med det samme', () => {
    const r = vagt([ROERT, el({ linje: 2, tekst: 'Slet', aktiveret: true, tests: ['t'] })], 5, [KENDT_N], []);
    expect(r.fejl).toHaveLength(1);
    expect(r.fejl[0]).toContain('--opdater');
    expect(r.fejl[0]).toContain(KENDT_N);
  });

  it('en undtagelse dækker et nyt urørt element — men kun med begrundelse', () => {
    const ny = el({ linje: 7, tekst: 'Ny knap' });
    const n = 'src/pages/A.jsx|A|button|Ny knap#1';
    expect(vagt([ROERT, KENDT, ny], 5, [KENDT_N], [{ noegle: n, begrundelse: 'Kun deaktiveret i alle tilstande', tilfoejet: '2026-09-03' }]).fejl).toEqual([]);
    const r = vagt([ROERT, KENDT, ny], 5, [KENDT_N], [{ noegle: n, begrundelse: '  ' }]);
    expect(r.fejl.some((f) => /mangler en begrundelse/.test(f))).toBe(true);
  });

  it('basislinjeNu (det, --opdater skriver) udelader de undtagne — ét sted pr. element', () => {
    const ny = el({ linje: 7, tekst: 'Ny knap' });
    const n = 'src/pages/A.jsx|A|button|Ny knap#1';
    const r = vagt([ROERT, KENDT, ny], 5, [KENDT_N], [{ noegle: n, begrundelse: 'dækket af e2e' }]);
    expect(r.fejl).toEqual([]);
    expect(r.basislinjeNu).toEqual([KENDT_N]);
  });

  it('advarer (ikke rødt) om en undtagelse, der ikke længere gælder noget urørt', () => {
    const r = vagt([ROERT], 5, [], [{ noegle: 'src/pages/A.jsx|A|button|Gem#1', begrundelse: 'x' }]);
    expect(r.fejl).toEqual([]);
    expect(r.advarsler).toHaveLength(1);
  });
});

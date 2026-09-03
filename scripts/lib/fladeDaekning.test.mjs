import { describe, it, expect } from 'vitest';
import { flet, appFor, laesLog, kildeKaede } from './fladeDaekning.mjs';
import { noegle, noegleFraDebugSource, noegleFraBabel, delNoegle } from './evneNoegle.mjs';

const KNAP = { noegle: 'src/A.jsx:10:5', fil: 'src/A.jsx', linje: 10, kolonne: 5, tag: 'button', type: null, tekst: 'Gem', haendelser: ['click'] };
const FORM = { noegle: 'src/A.jsx:8:3', fil: 'src/A.jsx', linje: 8, kolonne: 3, tag: 'form', type: null, tekst: null, haendelser: ['submit'] };
const FELT = { noegle: 'src/features/games/B.jsx:4:1', fil: 'src/features/games/B.jsx', linje: 4, kolonne: 1, tag: 'input', type: 'text', tekst: 'Navn', haendelser: ['change', 'input'] };
const INV = [FORM, KNAP, FELT];
const T = { generatedAt: '2026-09-03T20:00:00.000Z' };

describe('flet — kreditreglen', () => {
  it('et klik på en <span> inde i knappen krediterer knappen, ikke formen udenom', () => {
    const r = flet(INV, [{ type: 'click', kaede: ['src/A.jsx:11:7', KNAP.noegle, FORM.noegle], test: 't', testfil: 'src/A.test.jsx' }], T);
    const knap = r.elementer.find((e) => e.linje === 10);
    const form = r.elementer.find((e) => e.linje === 8);
    expect(knap.aktiveret).toBe(true);
    expect(knap.tests).toEqual(['src/A.test.jsx']);
    expect(form.aktiveret).toBe(false);
    expect(r.totals).toEqual({ elementer: 3, aktiverede: 1, logposter: 1 });
  });

  it('et klik på en <span> inde i formen (uden knap imellem) krediterer ingenting — form aktiveres af submit', () => {
    const r = flet(INV, [{ type: 'click', kaede: ['src/A.jsx:9:5', FORM.noegle], testfil: 'src/A.test.jsx' }], T);
    expect(r.totals.aktiverede).toBe(0);
    const s = flet(INV, [{ type: 'submit', kaede: [FORM.noegle], testfil: 'src/A.test.jsx' }], T);
    expect(s.elementer.find((e) => e.linje === 8).aktiveret).toBe(true);
  });

  it('en logpost, der kun peger på ukendte kildesteder, krediterer intet', () => {
    const r = flet(INV, [{ type: 'click', kaede: ['src/Ukendt.jsx:1:1', 'src/A.jsx:99:9'], testfil: 'x' }], T);
    expect(r.totals.aktiverede).toBe(0);
  });

  it('en tom log giver alt som ikke-aktiveret — ikke en fejl og ikke grønt', () => {
    const r = flet(INV, [], T);
    expect(r.totals).toEqual({ elementer: 3, aktiverede: 0, logposter: 0 });
    expect(r.elementer.every((e) => !e.aktiveret && e.tests.length === 0)).toBe(true);
  });

  it('samler testfiler pr. element, sorteret og uden dubletter, og sætter app', () => {
    const r = flet(INV, [
      { type: 'change', kaede: [FELT.noegle], testfil: 'src/features/games/Z.test.jsx' },
      { type: 'input', kaede: [FELT.noegle], testfil: 'src/features/games/B.test.jsx' },
      { type: 'change', kaede: [FELT.noegle], testfil: 'src/features/games/B.test.jsx' },
      { type: 'click', kaede: [FELT.noegle], testfil: 'src/features/games/Klik.test.jsx' }, // klik aktiverer ikke et tekstfelt
    ], T);
    const felt = r.elementer.find((e) => e.tag === 'input');
    expect(felt.tests).toEqual(['src/features/games/B.test.jsx', 'src/features/games/Z.test.jsx']);
    expect(felt.app).toBe('platform');
    expect(r.elementer.find((e) => e.tag === 'button').app).toBe('faelles');
    expect(r.generatedAt).toBe(T.generatedAt);
  });
});

describe('appFor', () => {
  it('platform = spil-mapperne og spilsiderne; tour = Tourens mapper og sider; resten fælles', () => {
    expect(appFor('src/features/games/football/FootballTip.jsx')).toBe('platform');
    expect(appFor('src/pages/GamePage.jsx')).toBe('platform');
    expect(appFor('src/pages/GamesPage.jsx')).toBe('platform');
    expect(appFor('src/features/tour/TourTab.jsx')).toBe('tour');
    expect(appFor('src/pages/LeaderboardPage.jsx')).toBe('tour');
    expect(appFor('src/pages/TeamPage.jsx')).toBe('tour');
    expect(appFor('src/features/admin/UsersTab.jsx')).toBe('faelles');
    expect(appFor('src/pages/ProfilePage.jsx')).toBe('faelles');
  });
});

describe('laesLog', () => {
  it('springer halve linjer over uden at tabe de hele', () => {
    expect(laesLog('{"type":"click","kaede":[]}\n{"type":"cl\n\n{"type":"submit","kaede":["a:1:1"]}\n')).toHaveLength(2);
  });
});

describe('evneNoegle — én konvertering', () => {
  it('babel (0-indekseret) og React (1-indekseret) mødes i samme nøgle', () => {
    const fraBabel = noegleFraBabel('src/A.jsx', { line: 10, column: 4 });
    const fraReact = noegleFraDebugSource({ fileName: '/repo/src/A.jsx', lineNumber: 10, columnNumber: 5 }, '/repo');
    expect(fraBabel).toBe('src/A.jsx:10:5');
    expect(fraReact).toBe(fraBabel);
    expect(noegle('src/A.jsx', 10, 5)).toBe(fraBabel);
    expect(delNoegle(fraBabel)).toEqual({ fil: 'src/A.jsx', linje: 10, kolonne: 5 });
    expect(noegleFraDebugSource(undefined, '/repo')).toBeNull();
  });
});

describe('kildeKaede', () => {
  it('følger fiber.return-kæden og springer led uden kilde over', () => {
    const c = { _debugSource: { fileName: '/r/src/C.jsx', lineNumber: 3, columnNumber: 1 }, return: null };
    const b = { _debugSource: undefined, return: c };
    const a = { _debugSource: { fileName: '/r/src/A.jsx', lineNumber: 1, columnNumber: 2 }, return: b };
    const el = { __reactFiber$abc: a };
    expect(kildeKaede(el, '/r')).toEqual(['src/A.jsx:1:2', 'src/C.jsx:3:1']);
    expect(kildeKaede({}, '/r')).toEqual([]);
  });
});

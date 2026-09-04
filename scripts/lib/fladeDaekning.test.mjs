import { describe, it, expect } from 'vitest';
import { flet, appFor, laesLog, kildeKaede, statusFor, renderBrud, antalInteraktioner, HAENDELSER } from './fladeDaekning.mjs';
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
    expect(r.totals).toEqual({ elementer: 3, aktiverede: 1, renderede: 1, logposter: 1, interaktioner: 1, filer: 2 });
    expect(r.e2eMedregnet).toBe(false);
    // Ingen render-poster i loggen: render er ikke målt, og de klikkede er
    // renderet pr. definition (man kan ikke klikke det, der ikke blev tegnet).
    expect(r.renderMaalt).toBe(false);
    expect(knap.status).toBe('roert');
    expect(form.status).toBe('aldrig');
  });

  it('et klik på en <span> inde i formen (uden knap imellem) krediterer ingenting — form aktiveres af submit', () => {
    const r = flet(INV, [{ type: 'click', kaede: ['src/A.jsx:9:5', FORM.noegle], testfil: 'src/A.test.jsx' }], T);
    expect(r.totals.aktiverede).toBe(0);
    const s = flet(INV, [{ type: 'submit', kaede: [FORM.noegle], testfil: 'src/A.test.jsx' }], T);
    expect(s.elementer.find((e) => e.linje === 8).aktiveret).toBe(true);
  });

  it('to klikbare elementer i samme kæde: KUN det inderste krediteres (Test Managers mutation: "alle forfædre")', () => {
    // En <div onClick> uden om en <button>: begge tager 'click'. Krediteres
    // alle forfædre, får div'en gratis point, hver gang knappen klikkes — og
    // fanen ville vise den som rørt, uden at nogen test nogensinde ramte den.
    const DIV = { noegle: 'src/A.jsx:5:3', fil: 'src/A.jsx', linje: 5, kolonne: 3, tag: 'div', type: null, tekst: 'klik-div', haendelser: ['click'] };
    const r = flet([DIV, KNAP], [{ type: 'click', kaede: ['src/A.jsx:11:7', KNAP.noegle, DIV.noegle], testfil: 'src/A.test.jsx' }], T);
    expect(r.elementer.find((e) => e.tag === 'button').aktiveret).toBe(true);
    expect(r.elementer.find((e) => e.tag === 'div').aktiveret).toBe(false);
    expect(r.totals.aktiverede).toBe(1);
  });

  it('en logpost, der kun peger på ukendte kildesteder, krediterer intet', () => {
    const r = flet(INV, [{ type: 'click', kaede: ['src/Ukendt.jsx:1:1', 'src/A.jsx:99:9'], testfil: 'x' }], T);
    expect(r.totals.aktiverede).toBe(0);
  });

  it('en tom log giver alt som ikke-aktiveret — ikke en fejl og ikke grønt', () => {
    const r = flet(INV, [], T);
    expect(r.totals).toEqual({ elementer: 3, aktiverede: 0, renderede: 0, logposter: 0, interaktioner: 0, filer: 2 });
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
    expect(r.elementer.find((e) => e.tag === 'button').app).toBe('andet');
    expect(r.generatedAt).toBe(T.generatedAt);
    expect(flet(INV, [], { ...T, e2eMedregnet: true }).e2eMedregnet).toBe(true);
  });
});

describe('flet — render-poster (hvad testene tegnede)', () => {
  it('en render-post krediterer ALLE nøgler i kæden, der står i inventaret — ikke kun den nærmeste — og tæller ikke som rørt', () => {
    // Modsat klik: en <span> inde i knappen inde i formen beviser, at BÅDE
    // knap og form blev tegnet. Mutation "nærmeste kun" → formen bliver 'aldrig'.
    const r = flet(INV, [{ type: 'render', kaede: ['src/A.jsx:11:7', KNAP.noegle, FORM.noegle, 'src/Ukendt.jsx:1:1'], testfil: 'src/A.test.jsx' }], T);
    const knap = r.elementer.find((e) => e.linje === 10);
    const form = r.elementer.find((e) => e.linje === 8);
    const felt = r.elementer.find((e) => e.tag === 'input');
    expect(knap).toMatchObject({ aktiveret: false, renderAntal: 1, status: 'vist', tests: [] });
    expect(Object.keys(knap)).not.toContain('renderet');
    expect(form).toMatchObject({ aktiveret: false, renderAntal: 1, status: 'vist' });
    expect(felt).toMatchObject({ aktiveret: false, renderAntal: 0, status: 'aldrig' });
    expect(r.renderMaalt).toBe(true);
    expect(r.totals).toEqual({ elementer: 3, aktiverede: 0, renderede: 2, logposter: 1, interaktioner: 0, filer: 2 });
  });

  it('render-kreditten går UDEN OM hændelses-gaten (QC-fund: ellers krediterede den nul, og hele fladen stod som aldrig vist)', () => {
    // Formen har haendelser ['submit'] — 'render' står der ikke. Den skal
    // alligevel blive 'vist'.
    const r = flet([FORM], [{ type: 'render', kaede: [FORM.noegle], testfil: 't' }], T);
    expect(r.elementer[0].status).toBe('vist');
  });

  it('renderAntal er ANTALLET af testfiler, ikke listen — og rørt + render giver status rørt', () => {
    const r = flet([KNAP], [
      { type: 'render', kaede: [KNAP.noegle], testfil: 'a.test.jsx' },
      { type: 'render', kaede: [KNAP.noegle], testfil: 'b.test.jsx' },
      { type: 'render', kaede: [KNAP.noegle], testfil: 'a.test.jsx' },
      { type: 'click', kaede: [KNAP.noegle], testfil: 'a.test.jsx' },
    ], T);
    expect(r.elementer[0]).toMatchObject({ aktiveret: true, renderAntal: 2, status: 'roert', tests: ['a.test.jsx'] });
    expect(Object.keys(r.elementer[0])).not.toContain('renderTests');
    expect(r.totals.interaktioner).toBe(1);
    expect(r.totals.logposter).toBe(4);
  });

  it('en ukendt posttype krediterer hverken rørt eller vist', () => {
    const r = flet([KNAP], [{ type: 'mousemove', kaede: [KNAP.noegle], testfil: 't' }, { type: 'hover', kaede: [KNAP.noegle], testfil: 't' }], T);
    expect(r.elementer[0].status).toBe('aldrig');
    expect(r.totals.interaktioner).toBe(0);
  });

  it('statusFor: rørt slår vist, vist slår aldrig', () => {
    expect(statusFor(true, 0)).toBe('roert');
    expect(statusFor(true, 3)).toBe('roert');
    expect(statusFor(false, 1)).toBe('vist');
    expect(statusFor(false, 0)).toBe('aldrig');
  });

  it('renderBrud: et rørt element uden render-kredit er et brud — KUN når render er målt', () => {
    // Klik uden render på knappen, mens formen har en render-post: tappen
    // filtrerer for hårdt eller er halvdød → knappen er et brud.
    const r = flet(INV, [
      { type: 'click', kaede: [KNAP.noegle], testfil: 't' },
      { type: 'render', kaede: [FORM.noegle], testfil: 't' },
    ], T);
    expect(renderBrud(r).map((e) => e.linje)).toEqual([10]);
    // Samme klik, men INGEN render-poster overhovedet: render er ikke målt,
    // og invarianten siger ingenting (ellers ville en gammel log bryde alt).
    const u = flet(INV, [{ type: 'click', kaede: [KNAP.noegle], testfil: 't' }], T);
    expect(renderBrud(u)).toEqual([]);
    // Og med render-kredit på det rørte: intet brud.
    const ok = flet(INV, [{ type: 'click', kaede: [KNAP.noegle], testfil: 't' }, { type: 'render', kaede: [KNAP.noegle], testfil: 't' }], T);
    expect(renderBrud(ok)).toEqual([]);
    expect(renderBrud(null)).toEqual([]);
  });

  it('antalInteraktioner tæller KUN hændelser fra HAENDELSER — render-poster kan ikke holde loggen "ikke tom" (QC-fund)', () => {
    expect(HAENDELSER).toEqual(['click', 'input', 'change', 'submit']);
    expect(antalInteraktioner([{ type: 'render', kaede: [] }, { type: 'render', kaede: [] }])).toBe(0);
    expect(antalInteraktioner([{ type: 'render', kaede: [] }, { type: 'click', kaede: [] }, { type: 'submit', kaede: [] }, null])).toBe(2);
    expect(antalInteraktioner(undefined)).toBe(0);
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
    expect(appFor('src/components/Layout.jsx')).toBe('faelles');
    // Bruges kun af Tour-siderne (sporet): hører til Tour, ikke 'andet'.
    expect(appFor('src/features/onboarding/OnboardingChecklist.jsx')).toBe('tour');
    expect(appFor('src/features/reactions/Reactions.jsx')).toBe('tour');
    expect(appFor('src/features/comments/LeagueWall.jsx')).toBe('tour');
    expect(appFor('src/features/comments/EmojiPicker.jsx')).toBe('faelles');
    // Fallback: en mappe, tabellen ikke kender, forsvinder IKKE — den lander i 'andet'.
    expect(appFor('src/features/nyt-omraade/Kort.jsx')).toBe('andet');
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

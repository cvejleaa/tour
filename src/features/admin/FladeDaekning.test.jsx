import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, within } from '@testing-library/react';
import FladeDaekning, { grupper, typeNavn, GRUPPER, statusAf, badgeFor, FILTRE } from './FladeDaekning';
import rigtig from '../../data/fladeDaekning.json';

const el = (o) => ({ fil: 'src/pages/GamesPage.jsx', linje: 1, kolonne: 1, tag: 'button', type: null, tekst: null, komponent: 'MyGameCard', app: 'platform', aktiveret: false, tests: [], renderAntal: 0, status: 'aldrig', ...o });
const roert = (tests) => ({ aktiveret: true, tests, renderAntal: tests.length, status: 'roert' });
const vist = (n) => ({ renderAntal: n, status: 'vist' });

const DATA = {
  generatedAt: '2026-09-03T20:00:00.000Z',
  e2eMedregnet: false,
  renderMaalt: true,
  totals: { elementer: 4, aktiverede: 2, renderede: 3, logposter: 5, interaktioner: 3, filer: 3 },
  elementer: [
    el({ linje: 84, tekst: null, ...roert(['src/pages/GamesPage.test.jsx', 'src/pages/GamePageForladt.test.jsx']) }),
    el({ linje: 64, tag: 'Link', tekst: 'Åbn spillet', komponent: 'MyGameCard', ...vist(3) }),
    el({ fil: 'src/features/admin/UsersTab.jsx', linje: 10, tag: 'input', type: 'checkbox', tekst: 'Godkend', komponent: 'UsersTab', app: 'faelles', ...roert(['src/features/admin/UsersTab.test.jsx']) }),
    el({ fil: 'src/features/tour/TourTab.jsx', linje: 5, tag: 'select', tekst: 'Etape', komponent: 'TourTab', app: 'tour' }),
  ],
};

/** Et GAMMELT øjebliksbillede: ingen render-måling, ingen status-felter. */
const GAMMEL = {
  ...DATA,
  renderMaalt: undefined,
  elementer: DATA.elementer.map(({ renderAntal, status, ...rest }) => rest), // eslint-disable-line no-unused-vars
};

describe('FladeDaekning — teksten er selve risikoen', () => {
  it('siger «Mindst 2 af 4» og bruger aldrig ordet «testet» om et element', () => {
    render(<FladeDaekning data={DATA} />);
    expect(screen.getByTestId('flade-tal')).toHaveTextContent('Mindst 2 af 4 knapper, felter, valglister og formularer bliver klikket eller udfyldt af mindst én automatisk test');
    expect(screen.getByTestId('flade-tal')).toHaveTextContent('fordelt på 3 filer');
    // Statusnavnene: "rørt", ikke "testet". Ordet "testet" ville love mere,
    // end fanen holder.
    expect(screen.getByText('rørt af 2 tests')).toBeInTheDocument();
    expect(screen.getByText('rørt af 1 test')).toBeInTheDocument();
    for (const b of screen.getAllByTestId('flade-element')) {
      expect(b.textContent).not.toMatch(/testet/i);
    }
    // Tallet er en brøk, ikke en procent: to procenter på samme fane læses som samme skala som donutens «100 % bestået».
    expect(screen.getByTestId('flade-tal')).not.toHaveTextContent('%');
    // De tre tal er af SAMME total (2 + 1 + 1 = 4), og Tour-andelen af de
    // aldrig viste står med — ellers modsiger tallet noten om, at Tour ikke
    // er noget at handle på (QC).
    expect(screen.getByTestId('flade-tre')).toHaveTextContent('Af de 4: 2 rørt, 1 vist, men ikke rørt, og 1 aldrig vist af nogen test — heraf 1 i Tour-appen, som er afsluttet.');
    expect(screen.getByText('vist i 3 tests, men ingen rører den')).toBeInTheDocument();
    expect(screen.getByText('ingen test viser den')).toBeInTheDocument();
    expect(screen.queryByText('ingen test rører den')).not.toBeInTheDocument();
    // «Aldrig vist» er gul (arbejdsliste), ikke rød (falliterklæring) — QC.
    expect(screen.getByText('ingen test viser den').className).toContain('badge--yellow');
    expect(screen.getByText('ingen test viser den').className).not.toContain('badge--red');
  });

  it('et GAMMELT øjebliksbillede uden render-måling viser to tilstande som før — og kalder ALDRIG noget «aldrig vist»', () => {
    // Tallene bages ind i bundtet: hosting kan være deployet før rapporten er
    // genereret. Læses «urørt» da som «aldrig vist», er det falsk alarm i den
    // alvorlige kategori.
    render(<FladeDaekning data={GAMMEL} />);
    expect(screen.getByTestId('flade-tal')).toHaveTextContent('Mindst 2 af 4');
    expect(screen.queryByTestId('flade-tre')).not.toBeInTheDocument();
    expect(screen.getAllByText('ingen test rører den')).toHaveLength(2);
    expect(screen.queryByText('ingen test viser den')).not.toBeInTheDocument();
    expect(screen.queryByText(/aldrig vist/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('flade-kun-aldrig')).not.toBeInTheDocument();
    expect(screen.getByTestId('flade-render-forbehold')).toHaveTextContent('kræver en nyere rapport');
    expect(screen.getByTestId('flade-render-forbehold')).toHaveTextContent('Opdatér test-rapporten');
    expect(screen.getByTestId('flade-kun-uroerte')).toBeInTheDocument();
  });

  it('forklarer over listen, hvad den IKKE kan se — begge dagens produktionsfejl ville stå rørt', () => {
    render(<FladeDaekning data={DATA} />);
    const f = screen.getByTestId('flade-forklaring');
    expect(f).toHaveTextContent('Hvad listen ikke kan se');
    expect(f).toHaveTextContent('Forlad-knappen blev klikket af fire tests og fejlede alligevel');
    expect(f).toHaveTextContent('«Næste kamp låser om …» er ikke en knap');
    expect(f).toHaveTextContent('100 % her ville betyde, at ingen knap står helt urørt. Ikke at intet kan gå galt.');
    expect(f).toHaveTextContent('godkendt af serveren og Firestore-reglerne, måles ikke her');
    expect(f).toHaveTextContent('De 100 % på Oversigt betyder, at alle tests består — ikke at alt er testet.');
    expect(f).toHaveTextContent('i hele kodebasen, uanset hvilken app du står i');
    // De tre tilstande er DEFINERET ved tallet — inkl. det, «vist» ikke kan
    // love (jsdom har ingen layout: bag en lukket fold tæller som vist).
    expect(f).not.toHaveTextContent('skelner endnu ikke');
    expect(f).toHaveTextContent('Tre tilstande.');
    expect(f).toHaveTextContent('Vist, men ikke rørt: elementet kom med i det, en test tegnede — også hvis det lå bag en lukket fold');
    expect(f).toHaveTextContent('Aldrig vist: ingen test har nogensinde tegnet det. Det er den alvorlige tilstand');
    // Ordet «testet» må kun stå i afvæbningen («ikke at alt er testet») — aldrig som en tilstand.
    expect(f.textContent.replace('ikke at alt er testet', '')).not.toMatch(/testet/i);
    // Forklaringen står IKKE bag en fold.
    expect(f.closest('details')).toBeNull();
  });

  it('E2E-forbeholdet og ordet «Mindst» styres af flaget — ikke af en hardkodet sætning', () => {
    const { unmount } = render(<FladeDaekning data={DATA} />);
    expect(screen.getByTestId('flade-e2e-forbehold')).toHaveTextContent('Klik fra E2E-testene (Playwright) tælles endnu ikke med');
    expect(screen.getByTestId('flade-e2e-forbehold')).toHaveTextContent('1X2-knapperne');
    unmount();
    render(<FladeDaekning data={{ ...DATA, e2eMedregnet: true }} />);
    expect(screen.queryByTestId('flade-e2e-forbehold')).not.toBeInTheDocument();
    expect(screen.getByTestId('flade-tal')).toHaveTextContent('2 af 4');
    expect(screen.getByTestId('flade-tal')).not.toHaveTextContent('Mindst');
  });

  it('viser type på dansk, teksten på elementet (eller at den dannes i koden), komponenten og fil:linje', () => {
    render(<FladeDaekning data={DATA} />);
    const linjer = screen.getAllByTestId('flade-element').map((l) => l.textContent);
    expect(linjer.some((t) => t.includes('Knap') && t.includes('(teksten dannes i koden)') && t.includes('i MyGameCard') && t.includes('pages/GamesPage.jsx:84'))).toBe(true);
    expect(linjer.some((t) => t.includes('Link') && t.includes('«Åbn spillet»') && t.includes('vist i 3 tests, men ingen rører den'))).toBe(true);
    expect(linjer.some((t) => t.includes('Afkrydsning') && t.includes('«Godkend»') && t.includes('i UsersTab'))).toBe(true);
    // De rørte viser HVILKE tests — det er det, ejeren bad om at kunne se.
    const knap = screen.getAllByTestId('flade-element').find((l) => l.textContent.includes('GamesPage.jsx:84'));
    expect(within(knap).getByText('src/pages/GamePageForladt.test.jsx')).toBeInTheDocument();
  });

  it('grupperer: spillet først, Tour foldet sammen med sin note, og urørte øverst i en fil', () => {
    render(<FladeDaekning data={DATA} />);
    expect(screen.getByTestId('flade-gruppe-platform')).toHaveTextContent('Spil-fladen (Superligaen og Premier League) · 1 af 2 rørt');
    // Ingen aldrig viste i platform → intet «aldrig vist»-tal i overskriften; i Tour står det.
    expect(screen.getByTestId('flade-gruppe-platform')).not.toHaveTextContent('aldrig vist');
    const tour = screen.getByTestId('flade-gruppe-tour');
    expect(tour).toHaveTextContent('0 af 1 rørt · 1 aldrig vist');
    expect(tour.tagName).toBe('DETAILS');
    expect(tour.open).toBe(false);
    expect(tour).toHaveTextContent('Tour de France er slut. Hullerne her er ikke noget at handle på.');
    expect(screen.queryByTestId('flade-gruppe-andet')).not.toBeInTheDocument();
    // I platform-filen står den urørte Link (linje 64) FØR den rørte knap (linje 84).
    const platform = within(screen.getByTestId('flade-gruppe-platform')).getAllByTestId('flade-element').map((l) => l.textContent);
    expect(platform[0]).toContain('GamesPage.jsx:64');
    expect(platform[1]).toContain('GamesPage.jsx:84');
    // Fælles-gruppen er fuldt rørt → afvæbningen står der.
    expect(screen.getByTestId('flade-gruppe-faelles')).toHaveTextContent('Alle 1 knapper og felter her bliver rørt af mindst én test. Det siger ikke, at de virker rigtigt');
  });

  it('valgknapperne «Vis kun det, ingen test rører» / «… ingen test viser» filtrerer — og sæsoneftersynet citerer præcis de tekster', () => {
    // Paritetsvagt (Test Manager): .claude/commands/saesoneftersyn.md bruger
    // filtrene som tjekliste og citerer deres tekst. Omdøbes de her, skal
    // kommandoen følge med — et spejl uden vagt er den næste "Spillene lige
    // nu"-løgn. Valgknapper, ikke afkrydsninger: «ingen test viser» er en
    // delmængde af «ingen test rører», og to afkrydsninger ville love
    // uafhængige til/fra (QC).
    render(<FladeDaekning data={DATA} />);
    const tekstAf = (id) => (screen.getByTestId(id).closest('label') || screen.getByTestId(id).parentElement).textContent.trim();
    expect(tekstAf('flade-kun-uroerte')).toBe('Vis kun det, ingen test rører');
    expect(tekstAf('flade-kun-aldrig')).toBe('Vis kun det, ingen test viser');
    expect(screen.getByTestId('flade-kun-uroerte').type).toBe('radio');
    const kommando = readFileSync(`${process.cwd()}/.claude/commands/saesoneftersyn.md`, 'utf8');
    expect(kommando).toContain('«Vis kun det, ingen test rører»');
    expect(kommando).toContain('«Vis kun det, ingen test viser»');
    expect(FILTRE.map((f) => f.label)).toEqual(['Vis alle', 'Vis kun det, ingen test rører', 'Vis kun det, ingen test viser']);
    expect(screen.getAllByTestId('flade-element')).toHaveLength(4);
    fireEvent.click(screen.getByTestId('flade-kun-uroerte'));
    const rest = screen.getAllByTestId('flade-element');
    expect(rest).toHaveLength(2);
    expect(rest.map((l) => l.dataset.status).sort()).toEqual(['aldrig', 'vist']);
    fireEvent.click(screen.getByTestId('flade-kun-aldrig'));
    const kunAldrig = screen.getAllByTestId('flade-element');
    expect(kunAldrig).toHaveLength(1);
    expect(kunAldrig[0]).toHaveTextContent('ingen test viser den');
    expect(kunAldrig[0]).toHaveTextContent('«Etape»');
    fireEvent.click(screen.getByTestId('flade-filter-alle'));
    expect(screen.getAllByTestId('flade-element')).toHaveLength(4);
  });

  it('i en fil står aldrig viste FØRST, så viste, så rørte — og filer sorteres efter antal aldrig viste', () => {
    const data = { ...DATA, elementer: [
      el({ fil: 'src/pages/A.jsx', linje: 1, ...roert(['t']) }),
      el({ fil: 'src/pages/A.jsx', linje: 2 }),
      el({ fil: 'src/pages/A.jsx', linje: 3, ...vist(1) }),
      el({ fil: 'src/pages/B.jsx', linje: 1, ...vist(1) }), el({ fil: 'src/pages/B.jsx', linje: 2, ...vist(1) }),
    ] };
    render(<FladeDaekning data={data} />);
    const linjer = screen.getAllByTestId('flade-element').map((l) => `${l.textContent.match(/pages\/[AB]\.jsx:\d/)[0]}=${l.dataset.status}`);
    // A har én aldrig vist → før B med to urørte (viste).
    expect(linjer).toEqual(['pages/A.jsx:2=aldrig', 'pages/A.jsx:3=vist', 'pages/A.jsx:1=roert', 'pages/B.jsx:1=vist', 'pages/B.jsx:2=vist']);
    // Fil-badgen (gul) for A — ud over tallet i sætningen øverst.
    expect(screen.getAllByText('1 aldrig vist').some((n) => n.className.includes('badge--yellow'))).toBe(true);
  });

  it('fejler ÅBENT ved en tom måling — ingen tal, ingen liste, vejen videre', () => {
    render(<FladeDaekning data={{ generatedAt: 'x', e2eMedregnet: false, totals: { elementer: 0, aktiverede: 0 }, elementer: [] }} />);
    expect(screen.getByTestId('flade-tom')).toHaveTextContent('ikke at appen ingen knapper har');
    expect(screen.getByTestId('flade-tom')).toHaveTextContent('Opdatér test-rapporten');
    expect(screen.queryByTestId('flade-tal')).not.toBeInTheDocument();
  });
});

describe('grupper og typeNavn', () => {
  it('sorterer filer efter antal urørte, faldende', () => {
    const g = grupper([
      el({ fil: 'src/pages/A.jsx', linje: 1, aktiveret: true, tests: ['t'] }),
      el({ fil: 'src/pages/B.jsx', linje: 1 }), el({ fil: 'src/pages/B.jsx', linje: 2 }),
      el({ fil: 'src/pages/C.jsx', linje: 1 }),
    ]);
    expect(g[0].filer.map((f) => f.fil)).toEqual(['src/pages/B.jsx', 'src/pages/C.jsx', 'src/pages/A.jsx']);
  });

  it('et element med en ukendt gruppe lander i «Andet» — det forsvinder ikke', () => {
    const g = grupper([el({ app: 'noget-nyt' })]);
    expect(g.find((x) => x.key === 'andet').antal).toBe(1);
  });

  it('gruppesummen af det RIGTIGE øjebliksbillede er lig totalen — også for de tre tilstande', () => {
    const maalt = rigtig.renderMaalt === true;
    const g = grupper(rigtig.elementer, maalt);
    expect(g.reduce((n, x) => n + x.antal, 0)).toBe(rigtig.totals.elementer);
    expect(g.reduce((n, x) => n + x.roerte, 0)).toBe(rigtig.totals.aktiverede);
    if (maalt) {
      expect(g.reduce((n, x) => n + x.roerte + x.viste, 0)).toBe(rigtig.totals.renderede);
      expect(g.reduce((n, x) => n + x.roerte + x.viste + x.aldrig, 0)).toBe(rigtig.totals.elementer);
      // Invarianten fra build-test-report: intet rørt element uden render-kredit.
      expect(rigtig.elementer.filter((e) => e.aktiveret && !(e.renderAntal > 0))).toEqual([]);
    }
    expect(GRUPPER.map((x) => x.key)).toEqual(['platform', 'faelles', 'tour', 'andet']);
  });

  it('statusAf og badgeFor: uden render-måling findes «aldrig» ikke', () => {
    expect(statusAf(el({ aktiveret: true }), true)).toBe('roert');
    expect(statusAf(el({ status: 'vist' }), true)).toBe('vist');
    expect(statusAf(el({ status: 'aldrig' }), true)).toBe('aldrig');
    expect(statusAf(el({}), false)).toBe('uroert');
    expect(statusAf(el({ status: 'aldrig' }), false)).toBe('uroert');
    expect(badgeFor(el({ ...vist(1) }), true)).toEqual({ klasse: 'badge--muted', tekst: 'vist i 1 test, men ingen rører den' });
    expect(badgeFor(el({}), true)).toEqual({ klasse: 'badge--yellow', tekst: 'ingen test viser den' });
    expect(badgeFor(el({}), false)).toEqual({ klasse: 'badge--muted', tekst: 'ingen test rører den' });
    expect(badgeFor(el({ ...roert(['a']) }), false)).toEqual({ klasse: 'badge--blue', tekst: 'rørt af 1 test' });
  });

  it('oversætter tag og type til ejerens ord', () => {
    expect(typeNavn({ tag: 'input', type: 'text' })).toBe('Indtastningsfelt');
    expect(typeNavn({ tag: 'input', type: 'radio' })).toBe('Valgknap');
    expect(typeNavn({ tag: 'NavLink' })).toBe('Link');
    expect(typeNavn({ tag: 'form' })).toBe('Formular');
    expect(typeNavn({ tag: 'summary' })).toBe('Foldeknap');
    expect(typeNavn({ tag: 'th' })).toBe('Klikbart element');
  });
});

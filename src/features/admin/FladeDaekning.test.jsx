import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, within } from '@testing-library/react';
import FladeDaekning, { grupper, typeNavn, GRUPPER } from './FladeDaekning';
import rigtig from '../../data/fladeDaekning.json';

const el = (o) => ({ fil: 'src/pages/GamesPage.jsx', linje: 1, kolonne: 1, tag: 'button', type: null, tekst: null, komponent: 'MyGameCard', app: 'platform', aktiveret: false, tests: [], ...o });

const DATA = {
  generatedAt: '2026-09-03T20:00:00.000Z',
  e2eMedregnet: false,
  totals: { elementer: 4, aktiverede: 2, logposter: 5, filer: 3 },
  elementer: [
    el({ linje: 84, tekst: null, aktiveret: true, tests: ['src/pages/GamesPage.test.jsx', 'src/pages/GamePageForladt.test.jsx'] }),
    el({ linje: 64, tag: 'Link', tekst: 'Åbn spillet', komponent: 'MyGameCard' }),
    el({ fil: 'src/features/admin/UsersTab.jsx', linje: 10, tag: 'input', type: 'checkbox', tekst: 'Godkend', komponent: 'UsersTab', app: 'faelles', aktiveret: true, tests: ['src/features/admin/UsersTab.test.jsx'] }),
    el({ fil: 'src/features/tour/TourTab.jsx', linje: 5, tag: 'select', tekst: 'Etape', komponent: 'TourTab', app: 'tour' }),
  ],
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
    expect(f).toHaveTextContent('skelner endnu ikke mellem «ingen test åbner siden» og «testen åbner siden uden at klikke»');
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
    expect(linjer.some((t) => t.includes('Link') && t.includes('«Åbn spillet»') && t.includes('ingen test rører den'))).toBe(true);
    expect(linjer.some((t) => t.includes('Afkrydsning') && t.includes('«Godkend»') && t.includes('i UsersTab'))).toBe(true);
    // De rørte viser HVILKE tests — det er det, ejeren bad om at kunne se.
    const knap = screen.getAllByTestId('flade-element').find((l) => l.textContent.includes('GamesPage.jsx:84'));
    expect(within(knap).getByText('src/pages/GamePageForladt.test.jsx')).toBeInTheDocument();
  });

  it('grupperer: spillet først, Tour foldet sammen med sin note, og urørte øverst i en fil', () => {
    render(<FladeDaekning data={DATA} />);
    expect(screen.getByTestId('flade-gruppe-platform')).toHaveTextContent('Spil-fladen (Superligaen og Premier League) · 1 af 2 rørt');
    const tour = screen.getByTestId('flade-gruppe-tour');
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

  it('afkrydsningen «Vis kun det, ingen test rører» skjuler de rørte — og sæsoneftersynet henviser til præcis den tekst', () => {
    // Paritetsvagt (Test Manager): .claude/commands/saesoneftersyn.md bruger
    // afkrydsningen som tjekliste og citerer dens tekst. Omdøbes den her,
    // skal kommandoen følge med — et spejl uden vagt er den næste
    // "Spillene lige nu"-løgn.
    render(<FladeDaekning data={DATA} />);
    const label = screen.getByTestId('flade-kun-uroerte').closest('label') || screen.getByTestId('flade-kun-uroerte').parentElement;
    const tekst = label.textContent.trim().replace(/\.$/, ''); // etiketten ender med punktum; citatet gør ikke
    expect(tekst).toBe('Vis kun det, ingen test rører');
    const kommando = readFileSync(`${process.cwd()}/.claude/commands/saesoneftersyn.md`, 'utf8');
    expect(kommando).toContain(`«${tekst}»`);
    expect(screen.getAllByTestId('flade-element')).toHaveLength(4);
    fireEvent.click(screen.getByTestId('flade-kun-uroerte'));
    const rest = screen.getAllByTestId('flade-element');
    expect(rest).toHaveLength(2);
    expect(rest.every((l) => l.textContent.includes('ingen test rører den'))).toBe(true);
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

  it('gruppesummen af det RIGTIGE øjebliksbillede er lig totalen', () => {
    const g = grupper(rigtig.elementer);
    expect(g.reduce((n, x) => n + x.antal, 0)).toBe(rigtig.totals.elementer);
    expect(g.reduce((n, x) => n + x.roerte, 0)).toBe(rigtig.totals.aktiverede);
    expect(GRUPPER.map((x) => x.key)).toEqual(['platform', 'faelles', 'tour', 'andet']);
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

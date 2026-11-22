// Tests for LeagueBets — hvem i mine ligaer tippede hvad på en startet kamp.
//
// Panelet var før foldet sammen bag «Se ligaens tips». Ejerens beslutning
// (22/11): altid fremme efter kickoff, navnene under hver 1/X/2-knap, og efter
// kampen de rigtige navne i fed grøn. Testene, der forsvarede fold-knappen og
// "mit eget tip vises ikke", er VENDT med vilje — ikke slettet.
//
// Der asserteres på INDHOLD: præcis hvilke navne i hvilken kolonne, «Dig» i
// den rigtige og ingen andre, og hvilken kolonne der er "ramt" — og hvad der
// IKKE må stå.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockHook = vi.fn();
vi.mock('./useMatchLeagueBets', () => ({
  useMatchLeagueBets: (...a) => mockHook(...a),
}));

import LeagueBets, {
  ensomRetLinje, ENSOM_MINIMUM, MAKS_VIST, samletListe, bindEmoji, synligeNavne,
} from './LeagueBets';

const MATCH = { id: 'm1', home: 'VIB', away: 'ODE', result: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockHook.mockReturnValue({ bets: [], loading: false, error: '' });
});

function element(props = {}) {
  return (
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route
          path="/spil/:gameId"
          element={<LeagueBets gameId="sl" match={MATCH} myUid="me" leagueIds={['L1']} {...props} />}
        />
      </Routes>
    </MemoryRouter>
  );
}
// På den rigtige rute, så "Bliv med i en liga" bliver et ægte link.
const renderIt = (props = {}) => render(element(props));

const svar = (bets, extra = {}) => mockHook.mockReturnValue({ loading: false, error: '', bets, ...extra });
const kolonne = (udfald) => screen.getByRole('group', { name: `Tippede ${udfald}` });
/** Linjerne i en kolonne som tekst — hårde mellemrum gjort til almindelige. */
const linjer = (udfald) => within(kolonne(udfald)).queryAllByRole('listitem')
  .map((li) => li.textContent.replace(/\u00A0/g, ' '));
const antal = (udfald) => kolonne(udfald).querySelector('.hvem__antal').textContent;

const b = (id, uid, name, pick, extra = {}) => ({ id, uid, name, pick, ...extra });
const ANDRE = [
  b('b1', 'u1', 'Anne', '1'),
  b('b2', 'u2', 'Bo', '1'),
  b('b3', 'u3', 'Carl', 'X'),
];

describe('LeagueBets — altid fremme efter kickoff', () => {
  it('henter med det samme — der er ingen fold-knap at trykke på', () => {
    renderIt();
    expect(mockHook).toHaveBeenLastCalledWith('sl', 'm1', ['L1'], true);
    // VENDT: før skulle knappen findes og hentningen vente på den.
    expect(screen.queryByRole('button', { name: /ligaens tips/i })).not.toBeInTheDocument();
  });

  it('henter IKKE uden liga — og forklarer, at man skal være i en', () => {
    // Uden liga ville forespørgslen blive afvist af reglen.
    renderIt({ leagueIds: [] });
    expect(mockHook).toHaveBeenLastCalledWith('sl', 'm1', [], false);
    const link = screen.getByRole('link', { name: /Bliv med i en liga/i });
    expect(link).toHaveAttribute('href', '/spil/sl?fane=ligaer');
    // .hvem-blok er e2e-specsenes greb om panelet (tip.spec.js: "intet panel på
    // en åben runde") — det skal også bæres i denne tilstand.
    expect(link.closest('.hvem-blok')).not.toBeNull();
    expect(screen.queryByRole('group', { name: /tippede hvad/i })).not.toBeInTheDocument();
  });

  it('sætter navnene i kolonnen under det udfald, de tippede — præcis dem', () => {
    svar([...ANDRE, b('b4', 'u4', 'Dot', '2')]);
    renderIt();
    expect(linjer('1')).toEqual(['Anne', 'Bo']);
    expect(linjer('X')).toEqual(['Carl']);
    expect(linjer('2')).toEqual(['Dot']);
    expect(antal('1')).toBe('2 tippede');
    expect(antal('X')).toBe('1 tippede');
  });

  // VENDT: før stod "viser ikke mit eget tip blandt de andres".
  it('sætter MIG som «Dig» øverst i min kolonne — og ingen andre steder', () => {
    svar(ANDRE);
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: 'X' } });
    expect(linjer('X')).toEqual(['Dig', 'Carl']);
    expect(linjer('1')).toEqual(['Anne', 'Bo']);
    expect(screen.getAllByText('Dig')).toHaveLength(1);
    expect(antal('X')).toBe('2 tippede');
  });

  it('tager «Dig» fra kortets eget tip, selv når forespørgslen ikke har det', () => {
    // Mit tip er kun i forespørgslen, når leagueIds er spejlet ud på det —
    // asynkront. Kortets eget bet er der med det samme.
    svar(ANDRE);
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: '2' } });
    expect(linjer('2')).toEqual(['Dig']);
  });

  it('viser mig ÉN gang, når både kortet og forespørgslen har mit tip', () => {
    svar([...ANDRE, b('me_m1', 'me', 'Mit Rigtige Navn', '1')]);
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: '1' } });
    expect(linjer('1')).toEqual(['Dig', 'Anne', 'Bo']);
    expect(screen.queryByText('Mit Rigtige Navn')).not.toBeInTheDocument();
  });

  it('falder tilbage på forespørgslens række, når kortet ikke har mit tip', () => {
    svar([...ANDRE, b('me_m1', 'me', 'Mit Rigtige Navn', '2')]);
    renderIt();
    expect(linjer('2')).toEqual(['Dig']);
    expect(screen.queryByText('Mit Rigtige Navn')).not.toBeInTheDocument();
  });

  it('kortets tip vinder over et forældet i forespørgslen', () => {
    svar([...ANDRE, b('me_m1', 'me', 'Mig', '1')]);
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: '2' } });
    expect(linjer('2')).toEqual(['Dig']);
    expect(linjer('1')).toEqual(['Anne', 'Bo']);
  });

  it('sætter ⚡ på Chance-tips — også på «Dig», ud fra kortets eget tip', () => {
    svar([b('b1', 'u1', 'Anne', '1', { chanceStake: 4 }), b('b2', 'u2', 'Bo', '1')]);
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: 'X', chanceStake: 3 } });
    expect(linjer('1')).toEqual(['Anne ⚡', 'Bo']);
    expect(linjer('X')).toEqual(['Dig ⚡']);
    expect(screen.getByTitle('Chancen: 3,0 point på spil')).toBeInTheDocument();
  });

  it('skriver «–» i en tom kolonne før facit — aldrig «Ingen»', () => {
    // «Ingen» ville påstå, at ingen tippede — men en tom kolonne kan være tips,
    // der endnu ikke er bagfyldt med liga-feltet.
    svar(ANDRE);
    renderIt();
    expect(within(kolonne('2')).getByText('–')).toBeInTheDocument();
    expect(antal('2')).toBe('0 tippede');
    expect(screen.queryByText(/Ingen/)).not.toBeInTheDocument();
  });

  // Afgjort sammen med QC punkt 8: har ingen ANDRE tippet, er der intet at
  // sammenligne med — så bliver den forsigtige sætning, og intet gitter.
  it('siger forsigtigt til, når ingen andre har tippet — og viser intet gitter', () => {
    svar([b('me_m1', 'me', 'Mig', '1')]);
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: '1' } });
    expect(screen.getByText('Ingen tips at vise fra dine ligaer på denne kamp.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /tippede hvad/i })).not.toBeInTheDocument();
  });

  it('viser en dansk fejl, hvis hentningen fejler — og intet gitter', () => {
    svar([], { error: 'Kunne ikke hente ligaens tips.' });
    renderIt();
    expect(screen.getByRole('alert')).toHaveTextContent(/kunne ikke hente/i);
    expect(screen.queryByRole('group', { name: /tippede hvad/i })).not.toBeInTheDocument();
  });

  it('viser en spinner og intet gitter, mens der hentes', () => {
    svar(ANDRE, { loading: true });
    renderIt();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /tippede hvad/i })).not.toBeInTheDocument();
  });
});

describe('LeagueBets — facit: de rigtige navne i fed grøn', () => {
  // jsdom anvender ingen CSS. "Fed grøn" er klassen hvem--ramt; at klassen
  // faktisk ER fed grøn — og læselig — måler theme.test.js i stylesheetet.
  const ramte = () => [...document.querySelectorAll('.hvem--ramt')].map((e) => e.dataset.udfald);
  const forbi = () => [...document.querySelectorAll('.hvem--forbi')].map((e) => e.dataset.udfald);

  it('farver INGEN kolonne før facit — og «Dig» er fed, men ikke "ramt"', () => {
    svar(ANDRE);
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: '1' } });
    expect(ramte()).toEqual([]);
    expect(forbi()).toEqual([]);
    expect(screen.queryByText(/✓/)).not.toBeInTheDocument();
    expect(screen.getByText('Dig')).toHaveClass('hvem__dig');
  });

  it('markerer KUN den rigtige kolonne, med ✓ ved antallet', () => {
    svar(ANDRE);
    renderIt({ match: { ...MATCH, result: 'X' } });
    expect(ramte()).toEqual(['X']);
    expect(forbi()).toEqual(['1', '2']);
    // «Rigtigt» bæres ikke af farve alene.
    expect(antal('X')).toBe('✓ 1 tippede – rigtigt udfald');
    expect(antal('1')).toBe('2 tippede');
    expect(screen.getAllByText(/✓/)).toHaveLength(1);
  });

  it('«Dig» følger samme regel som de andre navne', () => {
    svar(ANDRE);
    renderIt({ match: { ...MATCH, result: '1' }, myBet: { id: 'me_m1', uid: 'me', pick: '1' } });
    expect(kolonne('1')).toHaveClass('hvem--ramt');
    expect(linjer('1')).toEqual(['Dig', 'Anne', 'Bo']);
  });

  it('«Dig» i en forkert kolonne står dæmpet sammen med de andre forkerte', () => {
    svar(ANDRE);
    renderIt({ match: { ...MATCH, result: '1' }, myBet: { id: 'me_m1', uid: 'me', pick: '2' } });
    expect(kolonne('2')).toHaveClass('hvem--forbi');
    expect(kolonne('2')).not.toHaveClass('hvem--ramt');
    expect(linjer('2')).toEqual(['Dig']);
  });

  it('skriver «Ingen så den komme» i en tom RIGTIG kolonne — og «–» i en tom forkert', () => {
    svar([b('b1', 'u1', 'Anne', '1'), b('b2', 'u2', 'Bo', '1')]);
    renderIt({ match: { ...MATCH, result: 'X' } });
    expect(within(kolonne('X')).getByText('Ingen så den komme')).toBeInTheDocument();
    expect(within(kolonne('2')).getByText('–')).toBeInTheDocument();
    expect(within(kolonne('2')).queryByText(/Ingen/)).not.toBeInTheDocument();
  });

  it('ignorerer et facit, der ikke er 1/X/2', () => {
    svar(ANDRE);
    renderIt({ match: { ...MATCH, result: 'udsat' } });
    expect(ramte()).toEqual([]);
    expect(forbi()).toEqual([]);
  });
});

describe('LeagueBets — mange navne: «+N flere»', () => {
  const navne = (n, pick) => Array.from({ length: n }, (_, i) => b(`${pick}${i}`, `${pick}u${i}`, `Navn${String(i).padStart(2, '0')}`, pick));

  it('viser fem og folder resten bag «+N flere» — og folder ud ved klik', () => {
    svar(navne(8, '1'));
    renderIt();
    expect(linjer('1')).toEqual(['Navn00', 'Navn01', 'Navn02', 'Navn03', 'Navn04', '+3 flere']);
    expect(antal('1')).toBe('8 tippede');
    fireEvent.click(screen.getByRole('button', { name: '+3 flere' }));
    expect(linjer('1')).toEqual(['Navn00', 'Navn01', 'Navn02', 'Navn03', 'Navn04', 'Navn05', 'Navn06', 'Navn07']);
    expect(screen.queryByRole('button', { name: /flere/ })).not.toBeInTheDocument();
  });

  it('viser aldrig «+1 flere» — seks navne står alle sammen', () => {
    svar(navne(6, '1'));
    renderIt();
    expect(linjer('1')).toHaveLength(6);
    expect(screen.queryByText(/\+1 flere/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /flere/ })).not.toBeInTheDocument();
  });

  it('«Dig» står øverst, også i en foldet kolonne', () => {
    svar(navne(8, '1'));
    renderIt({ myBet: { id: 'me_m1', uid: 'me', pick: '1' } });
    expect(linjer('1')[0]).toBe('Dig');
    expect(linjer('1').at(-1)).toBe('+4 flere');
  });

  it('folder ALDRIG den rigtige kolonne efter facit — kun de forkerte', () => {
    // De grønne navne er belønningen og må ikke gemmes bag et klik.
    svar([...navne(8, '1'), ...navne(8, '2')]);
    renderIt({ match: { ...MATCH, result: '1' } });
    expect(linjer('1')).toHaveLength(8);
    expect(within(kolonne('1')).queryByRole('button')).not.toBeInTheDocument();
    expect(linjer('2').at(-1)).toBe('+3 flere');
  });

  it('MAKS_VIST er 5', () => {
    expect(MAKS_VIST).toBe(5);
    expect(synligeNavne([1, 2, 3, 4, 5, 6], true)).toEqual({ vis: [1, 2, 3, 4, 5, 6], rest: 0 });
    expect(synligeNavne([1, 2, 3, 4, 5, 6, 7], true)).toEqual({ vis: [1, 2, 3, 4, 5], rest: 2 });
    expect(synligeNavne([1, 2, 3, 4, 5, 6, 7], false).rest).toBe(0);
  });
});

describe('LeagueBets — linjen og kolonnerne regnes af SAMME liste', () => {
  it('«N af M» er altid summen af kolonnernes tal', () => {
    // Mit tip er KUN på kortet — ikke i forespørgslen. Regnedes linjen af
    // forespørgslen og kolonnerne af den samlede liste, ville M være én for lav.
    svar([
      b('b1', 'u1', 'Anne', '1'), b('b2', 'u2', 'Bo', '1'),
      b('b3', 'u3', 'Carl', '1'), b('b4', 'u4', 'Dot', 'X'),
    ]);
    renderIt({ match: { ...MATCH, result: '2' }, myBet: { id: 'me_m1', uid: 'me', pick: '2' } });
    const linje = screen.getByText(/så det komme/).textContent;
    expect(linje).toBe('Kun du så det komme — 1 af 5 ramte.');
    const sum = ['1', 'X', '2'].reduce((s, o) => s + Number(antal(o).match(/(\d+) tippede/)[1]), 0);
    expect(sum).toBe(5);
    expect(linje).toContain(`af ${sum} ramte`);
  });
});

describe('LeagueBets — onHentet (til ?kamp=-rulningen i FootballTip)', () => {
  it('kaldes, når hentningen går fra i gang til færdig — ikke før', () => {
    const onHentet = vi.fn();
    svar([], { loading: true });
    const { rerender } = render(element({ onHentet }));
    expect(onHentet).not.toHaveBeenCalled();
    svar(ANDRE);
    rerender(element({ onHentet }));
    expect(onHentet).toHaveBeenCalledTimes(1);
    rerender(element({ onHentet }));
    expect(onHentet).toHaveBeenCalledTimes(1);
  });

  it('kaldes ikke, når der aldrig blev hentet', () => {
    const onHentet = vi.fn();
    renderIt({ onHentet, leagueIds: [] });
    expect(onHentet).not.toHaveBeenCalled();
  });
});

describe('samletListe og bindEmoji', () => {
  it('lægger mit tip først som «Dig» og fjerner forespørgslens kopi', () => {
    const { andre, alle } = samletListe(
      [b('x', 'me', 'Mig', '1'), b('y', 'u1', 'Anne', '2')],
      { id: 'x', uid: 'me', pick: '1' },
      'me',
    );
    expect(andre.map((r) => r.name)).toEqual(['Anne']);
    expect(alle.map((r) => r.name)).toEqual(['Dig', 'Anne']);
    expect(alle[0].erMig).toBe(true);
  });

  it('binder emojien til ordet foran med et hårdt mellemrum', () => {
    expect(bindEmoji('Team Sharkey ⚽')).toBe('Team Sharkey\u00A0⚽');
    expect(bindEmoji('Marianne - Tourvinder 🏅')).toBe('Marianne - Tourvinder\u00A0🏅');
    // Mellemrum mellem ORD røres ikke — de må gerne knække.
    expect(bindEmoji('Forza Bif')).toBe('Forza Bif');
  });

  it('bruger det bundne navn i kolonnen', () => {
    svar([b('b1', 'u1', 'Team Sharkey ⚽', '1')]);
    renderIt();
    const li = within(kolonne('1')).getByRole('listitem');
    expect(li.textContent).toBe('Team Sharkey\u00A0⚽');
  });
});

describe('LeagueBets — den ensomme ret', () => {
  // Sætningen er panelets eneste indhold, der ikke kan slås op andre steder.
  // Der asserteres på HVAD der står — ikke kun på at noget blev vist.
  const FIRE = [
    b('b0', 'me', 'Mig', '2'),
    b('b1', 'u1', 'Anne', '1'),
    b('b2', 'u2', 'Bo', '1'),
    b('b3', 'u3', 'Carl', 'X'),
  ];
  const med = (result) => { svar(FIRE); renderIt({ match: { ...MATCH, result } }); };

  it('siger "Kun du", når man SELV stod alene med det rigtige', () => {
    // Mig tippede '2' og ingen andre gjorde. Filtreres ens eget tip fra,
    // ville linjen sige det modsatte: "ingen så den her" — til den, der så den.
    med('2');
    expect(screen.getByText('Kun du så det komme — 1 af 4 ramte.')).toBeInTheDocument();
    expect(screen.queryByText(/Ingen i ligaen/)).not.toBeInTheDocument();
  });

  it('siger navnet, når det var en ANDEN, der stod alene', () => {
    med('X');
    expect(screen.getByText('Kun Carl så det komme — 1 af 4 ramte.')).toBeInTheDocument();
  });

  it('siger til, når INGEN i ligaen ramte', () => {
    svar([b('b1', 'u1', 'Anne', '1'), b('b2', 'u2', 'Bo', '1'), b('b3', 'u3', 'Carl', '1')]);
    renderIt({ match: { ...MATCH, result: '2' } });
    expect(screen.getByText('Ingen i ligaen så den her — 0 af 3 ramte.')).toBeInTheDocument();
  });

  it('tier, når FLERE ramte — så er der ingen historie', () => {
    med('1'); // Anne og Bo ramte begge
    expect(screen.queryByText(/Kun /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ingen i ligaen/)).not.toBeInTheDocument();
  });

  it('tier før facit er sat', () => {
    med(null);
    expect(screen.queryByText(/så det komme/)).not.toBeInTheDocument();
  });

  it('viser IKKE linjen, mens der hentes — rækkerne kan være forældede', () => {
    // useMatchLeagueBets nulstiller ikke bets ved en ny hentning, så under en
    // refetch ville linjen blive regnet af de gamle tips, mens gitteret
    // korrekt er skjult. Begge dele følges ad.
    svar(FIRE.slice(0, 3), { loading: true });
    renderIt({ match: { ...MATCH, result: '2' } });
    expect(screen.queryByText(/så det komme/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('ensomRetLinje — gulvet', () => {
  const tre = (picks) => picks.map((p, i) => ({ id: `b${i}`, uid: `u${i}`, name: `N${i}`, pick: p }));

  it('tier under gulvet, hvor "kun én" er en mønt og ikke en historie', () => {
    // To tips: én ramte. Sandt, men uden vægt — derfor ingen linje.
    expect(ensomRetLinje(tre(['1', '2']), '1', 'x')).toBeNull();
    // Præcis ved gulvet siger den til. Hæves ENSOM_MINIMUM, bliver dette rødt.
    expect(ensomRetLinje(tre(['1', '2', '2']), '1', 'x'))
      .toBe('Kun N0 så det komme — 1 af 3 ramte.');
  });

  it('har et gulv på 3 — ikke 2', () => {
    expect(ENSOM_MINIMUM).toBe(3);
  });

  it('tæller kun GYLDIGE tips med i grundlaget', () => {
    const rodet = [
      { id: 'a', uid: 'u1', name: 'Anne', pick: '1' },
      { id: 'b', uid: 'u2', name: 'Bo', pick: '2' },
      { id: 'c', uid: 'u3', name: 'Carl', pick: '2' },
      { id: 'd', uid: 'u4', name: 'Dot', pick: null },
    ];
    // Fire rækker, men kun tre valg — grundlaget skal være 3, ikke 4.
    expect(ensomRetLinje(rodet, '1', 'x')).toBe('Kun Anne så det komme — 1 af 3 ramte.');
  });
});

// Tests for GameStandings — især liga-filteret.
//
// Fixturet er lagt, så ÉN liga giver flere end 3 spillere (podie + tabel) og
// én giver præcis 3 (kun podie). Ellers ville assertions ramme podiet, mens
// man tror, man læser tabellen.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase', () => ({ db: {} }));

const mockStandings = vi.fn();
vi.mock('./useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => mockStandings(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));

// Avataren må IKKE skrive navnet: cellen renderer det selv, og så ville
// textContent blive "AnneAnne".
vi.mock('../../components/Avatar', () => ({
  default: () => <span data-testid="avatar" />,
}));

vi.mock('./football/SpillerDetalje', () => ({
  default: ({ spiller }) => <div data-testid="detalje">{spiller.name}</div>,
}));

import GameStandings from './GameStandings';

// Hele kredsen, rangeret som useVisibleGameStandings ville levere den.
const ROWS = [
  { uid: 'u1', name: 'Anne', totalPoints: 60, rank: 1 },
  { uid: 'u2', name: 'Bo', totalPoints: 50, rank: 2 },
  { uid: 'u3', name: 'Carl', totalPoints: 40, rank: 3 },
  { uid: 'u4', name: 'Dorte', totalPoints: 30, rank: 4 },
  { uid: 'me', name: 'Mig', totalPoints: 20, rank: 5 },
  { uid: 'u5', name: 'Erik', totalPoints: 10, rank: 6 },
];
const LEAGUES = [
  // 5 medlemmer → podie (3) + tabel (2)
  { id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1', 'u2', 'u3', 'u4'] },
  // 3 medlemmer → kun podie. Erik er nr. 6 i kredsen, men nr. 3 her.
  { id: 'L2', name: 'Familien', memberUids: ['me', 'u1', 'u5'] },
];

let container;
function setup({ standings = ROWS, leagues = LEAGUES } = {}) {
  mockStandings.mockReturnValue({
    standings, leagues, leagueCount: leagues.length, loading: false, error: null,
  });
  // Skal stå på den rigtige rute: ellers falder GameTabLink tilbage til ren
  // tekst, og linkene ville være utestede.
  const r = render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route path="/spil/:gameId" element={<GameStandings gameId="sl" />} />
      </Routes>
    </MemoryRouter>,
  );
  container = r.container;
  return r;
}

const filter = () => screen.getByLabelText('Vis stilling for');

/** [rangtal, navn] pr. række i SELVE TABELLEN — ikke podiet. */
function tableRows() {
  const table = container.querySelector('table');
  if (!table) return [];
  return [...table.querySelectorAll('tbody tr')].map((tr) => {
    const tds = tr.querySelectorAll('td');
    return [tds[0].textContent.replace(/[▲▼]\d+/, '').trim(), tds[1].textContent.trim()];
  });
}

/** Navnet på podiepladsen med et bestemt rangtal. */
function podiumName(rank) {
  const spot = [...container.querySelectorAll('.podium__spot')]
    .find((s) => s.querySelector('.podium__plads')?.textContent === String(rank));
  return spot ? spot.querySelector('.podium__name').textContent : null;
}

/** Trin-højdeklassen (1/2/3) for podiepladsen med et bestemt rangtal. */
function podiumTrin(rank) {
  const spot = [...container.querySelectorAll('.podium__spot')]
    .find((s) => s.querySelector('.podium__plads')?.textContent === String(rank));
  return spot ? [...spot.querySelector('.podium__trin').classList].find((c) => /--\d$/.test(c)) : null;
}

/** Navnene i podiets VISUELLE rækkefølge, venstre mod højre. */
const podiumOrder = () => [...container.querySelectorAll('.podium__spot .podium__name')]
  .map((e) => e.textContent);

beforeEach(() => vi.clearAllMocks());

describe('GameStandings — liga-filter', () => {
  it('viser alle mine ligaer samlet som standard', () => {
    setup();
    expect(filter().value).toBe('__alle__');
    expect(podiumName(1)).toBe('Anne');
    expect(tableRows().map((r) => r[1])).toEqual(['Dorte', 'Mig (dig)', 'Erik']);
  });

  it('tilbyder én mulighed pr. liga plus samlet', () => {
    setup();
    const options = within(filter()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Alle mine ligaer', 'Kontoret', 'Familien']);
  });

  it('filtrerer ned til én ligas medlemmer', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    const navne = [podiumName(1), podiumName(2), podiumName(3), ...tableRows().map((r) => r[1])];
    expect(navne).toEqual(['Anne', 'Bo', 'Carl', 'Dorte', 'Mig (dig)']);
    expect(navne).not.toContain('Erik'); // kun i Familien
  });

  // DETTE er pointen med filteret. Uden gen-rangering ville Erik beholde sin
  // 6. plads fra hele kredsen og stå med "#6" i podiet i stedet for bronze.
  it('gen-rangerer inden for den valgte liga — Erik er nr. 3, ikke nr. 6', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L2' } });
    expect(podiumName(1)).toBe('Anne');
    expect(podiumName(2)).toBe('Mig');
    expect(podiumName(3)).toBe('Erik');
    expect(podiumName(6)).toBeNull();
  });

  // Et podie er tre trin i forskellig højde med vinderen i MIDTEN — ikke tre
  // ens kasser på række. Rækkefølgen er 2 · 1 · 3, og trinnet følger
  // PLACERINGEN.
  it('stiller podiet op som et podie: 2 · 1 · 3 med vinderen højest', () => {
    setup();
    expect(podiumOrder()).toEqual(['Bo', 'Anne', 'Carl']);
    expect(podiumTrin(1)).toBe('podium__trin--1');
    expect(podiumTrin(2)).toBe('podium__trin--2');
    expect(podiumTrin(3)).toBe('podium__trin--3');
  });

  // KNAPPENS PLACERING var halvdelen af ændringen, og den kunne skrives om
  // ubemærket: knappen kunne flyttes tilbage til præcis den kritiserede plads
  // mellem podiet og listen, uden at én test faldt.
  it('lægger knappen i værktøjslinjen OVER podiet', () => {
    setup();
    const bar = container.querySelector('.standings__bar');
    expect(bar).toContainElement(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    // Dokumentrækkefølgen: baren skal komme FØR podiet. querySelectorAll
    // leverer altid i dokumentrækkefølge, så den første af de to er den
    // øverste på skærmen.
    const raekkefoelge = [...container.querySelectorAll('.standings__bar, .podium')]
      .map((e) => e.className);
    expect(raekkefoelge).toEqual(['standings__bar', 'podium']);
  });

  // Medaljen er det mest iøjnefaldende på podiet og var utestet — også før.
  it('viser en medalje pr. plads i podiets rækkefølge', () => {
    setup();
    expect([...container.querySelectorAll('.podium__medal')].map((e) => e.textContent))
      .toEqual(['🥈', '🥇', '🥉']);
  });

  // Deling af TO om førstepladsen er det næste, der opstår: rang 1, 1, 3.
  // En "tæt" rangering (1, 1, 2) ville slippe forbi tre-vejs-testen.
  // Ombytningen 2 · 1 · 3 findes ALENE for at sætte vinderen i midten. Uden en
  // enkelt vinder udpegede den en tilfældig af de delende — ved lige point den
  // alfabetisk første — til den brede midterplads, og fik podiet til at læse i
  // én rækkefølge, mens tabellen lige nedenunder læste i en anden.
  it('bytter ikke om og bruger lige bredder, når ingen står alene forrest', () => {
    const lige = [
      { uid: 'u1', name: 'Anne', totalPoints: 12.8, rank: 1 },
      { uid: 'u2', name: 'Bo', totalPoints: 12.8, rank: 1 },
      { uid: 'u3', name: 'Carl', totalPoints: 12.8, rank: 1 },
      { uid: 'me', name: 'Mig', totalPoints: 5, rank: 4 },
    ];
    setup({ standings: lige, leagues: [{ id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1', 'u2', 'u3'] }] });
    expect(podiumOrder()).toEqual(['Anne', 'Bo', 'Carl']);
    expect(container.querySelector('.podium').className).toContain('podium--lige');
  });

  it('bytter om og løfter midten, når der ER en enkelt vinder', () => {
    setup();
    expect(podiumOrder()).toEqual(['Bo', 'Anne', 'Carl']);
    expect(container.querySelector('.podium').className).not.toContain('podium--lige');
  });

  it('giver to i deling samme trin — og bronzen sit eget', () => {
    const lige = [
      { uid: 'u1', name: 'Anne', totalPoints: 12.8, rank: 1 },
      { uid: 'u2', name: 'Bo', totalPoints: 12.8, rank: 1 },
      { uid: 'u3', name: 'Carl', totalPoints: 9, rank: 3 },
      { uid: 'me', name: 'Mig', totalPoints: 5, rank: 4 },
    ];
    setup({ standings: lige, leagues: [{ id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1', 'u2', 'u3'] }] });
    const trin = [...container.querySelectorAll('.podium__trin')]
      .map((t) => [...t.classList].find((c) => /--\d$/.test(c)));
    expect(trin).toEqual(['podium__trin--1', 'podium__trin--1', 'podium__trin--3']);
  });

  // Står tre spillere lige, har de ALLE rang 1. Så skal de stå i samme højde
  // — et podie, der løfter én af tre lige spillere, lyver om stillingen.
  it('giver tre spillere i deling samme trin', () => {
    const lige = [
      { uid: 'u1', name: 'Anne', totalPoints: 12.8, rank: 1 },
      { uid: 'u2', name: 'Bo', totalPoints: 12.8, rank: 1 },
      { uid: 'u3', name: 'Carl', totalPoints: 12.8, rank: 1 },
      { uid: 'me', name: 'Mig', totalPoints: 5, rank: 4 },
    ];
    setup({ standings: lige, leagues: [{ id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1', 'u2', 'u3'] }] });
    const trin = [...container.querySelectorAll('.podium__trin')]
      .map((t) => [...t.classList].find((c) => /--\d$/.test(c)));
    expect(trin).toEqual(['podium__trin--1', 'podium__trin--1', 'podium__trin--1']);
  });

  it('gen-rangerer også rækkerne i tabellen', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    expect(tableRows()).toEqual([['4', 'Dorte'], ['5', 'Mig (dig)']]);
  });

  it('fortæller hvilken liga der vises', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    expect(screen.getByText('Viser de 5 spillere i Kontoret.')).toBeInTheDocument();
  });

  // Den mest sandsynlige forekomst: en ny spiller, der lige har oprettet sin
  // egen liga, står alene i STANDARDVISNINGEN. "Viser 1 spiller, du deler liga
  // med" ville være usandt — den ene spiller er én selv.
  it('siger det ligeud, når man er alene i standardvisningen', () => {
    setup({ standings: [ROWS[4]] });
    expect(screen.getByText(/Viser kun dig selv/)).toBeInTheDocument();
    expect(screen.queryByText(/du deler liga med/)).not.toBeInTheDocument();
  });

  // Bestemt form i flertal: listen trunkeres aldrig, så "de N" siger korrekt,
  // at det er dem alle. Uden denne kunne "de" fjernes ubemærket.
  it('beholder bestemt form i flertal', () => {
    setup();
    expect(screen.getByText('Viser de 6 spillere, du deler liga med.')).toBeInTheDocument();
  });

  // En liga kan have ét medlem — så må der ikke stå "1 spillere".
  it('bøjer teksten rigtigt ved én spiller i ligaen', () => {
    setup({ leagues: [...LEAGUES, { id: 'L5', name: 'Kun mig', memberUids: ['me'] }] });
    fireEvent.change(filter(), { target: { value: 'L5' } });
    expect(screen.getByText('Viser 1 spiller i Kun mig.')).toBeInTheDocument();
  });

  // Har man valgt en liga, vil man typisk videre TIL den.
  it('linker til ligaen, når en er valgt', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    // Liga-id'et skal med, ellers lander man på en liste, hvor alt er foldet
    // sammen — og mærkatet lovede mere, end klikket gav.
    expect(screen.getByRole('link', { name: /Åbn ligaen/ }))
      .toHaveAttribute('href', '/spil/sl?fane=ligaer&liga=L1');
  });

  it('linker ikke til en liga i den samlede visning', () => {
    setup();
    expect(screen.queryByRole('link', { name: /Åbn ligaen/ })).not.toBeInTheDocument();
  });

  // Kredsen har rækker, men man er ikke i nogen liga: "Du er ikke med i en
  // liga endnu" — dér skal der være en vej videre.
  it('sender én uden liga videre til Ligaer-fanen', () => {
    setup({ leagues: [] });
    expect(screen.getByRole('link', { name: /Gå til Ligaer/ }))
      .toHaveAttribute('href', '/spil/sl?fane=ligaer');
  });

  it('markerer én selv i tabellen', () => {
    setup();
    expect(tableRows().some(([, navn]) => navn.includes('(dig)'))).toBe(true);
  });

  // Med én liga er "alle mine ligaer" og den ene liga det samme valg.
  it('skjuler filteret, når man kun er med i én liga', () => {
    setup({ leagues: [LEAGUES[0]] });
    expect(screen.queryByLabelText('Vis stilling for')).not.toBeInTheDocument();
  });

  it('falder tilbage til alle, hvis den valgte liga forsvinder', () => {
    const { rerender } = setup();
    fireEvent.change(filter(), { target: { value: 'L2' } });
    expect(screen.getByText(/i Familien/)).toBeInTheDocument();
    // Man forlader Familien, mens man kigger.
    mockStandings.mockReturnValue({
      standings: ROWS, leagues: [LEAGUES[0]], leagueCount: 1, loading: false, error: null,
    });
    rerender(
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route path="/spil/:gameId" element={<GameStandings gameId="sl" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/du deler liga med/)).toBeInTheDocument();
  });

  // Tom-tilstanden måles på hele kredsen. Ellers ville en tom liga skjule
  // filteret, og man kunne ikke vælge sig tilbage.
  it('beholder filteret, selv om den valgte liga ingen rækker har', () => {
    setup({ leagues: [...LEAGUES, { id: 'L3', name: 'Tom liga', memberUids: ['fremmed'] }] });
    fireEvent.change(filter(), { target: { value: 'L3' } });
    expect(screen.getByLabelText('Vis stilling for')).toBeInTheDocument();
    expect(screen.getByText(/Ingen af ligaens medlemmer/)).toBeInTheDocument();
  });

  it('viser stadig "ingen deltagere", når hele kredsen er tom', () => {
    setup({ standings: [] });
    expect(screen.getByText('Ingen deltagere endnu.')).toBeInTheDocument();
  });

  // Podiet kræver mindst 3. Ved præcis 2 skal alle stå i tabellen i stedet.
  it('viser intet podie i en liga med under 3 spillere', () => {
    setup({ leagues: [...LEAGUES, { id: 'L4', name: 'Parret', memberUids: ['me', 'u1'] }] });
    fireEvent.change(filter(), { target: { value: 'L4' } });
    expect(container.querySelector('.podium')).toBeNull();
    expect(tableRows()).toEqual([['1', 'Anne'], ['2', 'Mig (dig)']]);
  });
});

// ---------------------------------------------------------------------------
// Opdelingen: hvor pointene kommer fra. En EGEN visning, ikke en udvidelse af
// stillingen — seks tal pr. række ville drukne en liste med tre kolonner på
// mobil, og podiet har plads til nøjagtig ét tal.
// ---------------------------------------------------------------------------
describe('GameStandings — pointopdeling', () => {
  // Tal, der ikke kolliderer med nogen totals i ROWS — ellers kan testen ikke
  // skelne en rubrik fra en total. 31 + 12,5 + 9,5 + 7 = 60, Annes total.
  const MED = ROWS.map((r, i) => (i === 0
    ? { ...r, opdeling: { p1x2: 31, chance: 12.5, combi: 9.5, pulje: 7 } }
    : r));

  it('er slået FRA som udgangspunkt', () => {
    setup();
    expect(screen.queryByText(/Chancen/)).toBeNull();
    expect(screen.getByRole('button', { name: /Hvor kommer pointene fra/ })).toBeInTheDocument();
  });

  it('viser rubrikkerne, når man folder den ud', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.getAllByText(/Chancen/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Combi/).length).toBeGreaterThan(0);
    expect(screen.getByText('31')).toBeInTheDocument();
    // Chancen er den eneste rubrik, der kan gå i minus, og vises derfor med
    // fortegn. Uden det ligner et tab en gevinst.
    expect(screen.getByText('+12,5')).toBeInTheDocument();
    expect(screen.getByText('9,5')).toBeInTheDocument();
  });

  // title-teksten på kolonneoverskriften findes ikke på en telefon — der er
  // ingen mus at holde stille. Uden en skreven forklaring står spilleren med
  // fire ord, han aldrig har set før.
  it('forklarer rubrikkerne i tekst, ikke kun som tooltip', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.getByText(/Bonus for en hel runde med højst én fejl/)).toBeInTheDocument();
  });

  // Knappen lover, at regnskabet går op. Gør det ikke — gulvet, eller en kamp
  // opdelingen ikke kunne læse — skal det siges, ikke skjules.
  it('markerer rækker, hvor delene ikke summer til totalen', () => {
    const skæv = [{ ...ROWS[0], opdeling: { p1x2: 11, chance: -44.8, combi: 0, pulje: 8.5 }, totalPoints: 0 },
      ...ROWS.slice(1)];
    setup({ standings: skæv });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.getByText(/Delene summer ikke til totalen/)).toBeInTheDocument();
  });

  it('markerer ingenting, når delene stemmer', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.queryByText(/Delene summer ikke til totalen/)).toBeNull();
  });

  // Noten om, at opdelingen ikke er bygget endnu, gælder KUN når ingen har
  // den. Har én spiller tallene, er de andre bare ikke nået frem endnu, og så
  // ville sætningen modsige de tal, der står lige ovenover.
  it('siger ikke "opdelingen bygges", når nogen allerede har den', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.queryByText(/Opdelingen bygges/)).toBeNull();
  });

  // Din egen række skal kunne findes i et felt på 22 med seks talkolonner.
  it('mærker din egen række i opdelingen', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.getByText(/\(dig\)/)).toBeInTheDocument();
  });

  // Podiet har plads til ét tal, og stillingen skal svare på "hvem fører".
  it('rører ikke podiet, når opdelingen er slået til', () => {
    setup({ standings: MED });
    const foer = container.querySelectorAll('.podium__spot').length;
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(container.querySelectorAll('.podium__spot')).toHaveLength(foer);
  });

  // En streg og ikke et nul. Findes opdelingen ikke endnu, HAR vi ikke tallet
  // — vi ved ikke, at det er nul. Fire nuller ville påstå, at spilleren ingen
  // point har fået, mens totalen ved siden af siger noget andet.
  it('viser en streg, ikke nuller, for spillere uden opdeling endnu', () => {
    setup({ standings: ROWS });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.getByText(/Opdelingen bygges, næste gang en kamp afgøres/)).toBeInTheDocument();
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
  });

  it('kan foldes sammen igen', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tilbage til listen/ }));
    expect(screen.queryByText(/Chancen/)).toBeNull();
  });
});

describe('GameStandings — spillerdetalje', () => {
  it('åbner panelet, når man klikker på et navn', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dorte' }));
    expect(screen.getByTestId('detalje')).toHaveTextContent('Dorte');
  });

  it('lukker igen ved et nyt klik på samme navn', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dorte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dorte' }));
    expect(screen.queryByTestId('detalje')).toBeNull();
  });

  // Panelet må ikke blive stående med data fra en spiller, man ikke længere
  // ser. Skifter man liga, forsvinder han fra kredsen — og adgangen til hans
  // detalje følger med.
  it('lukker af sig selv, når spilleren forsvinder fra den valgte liga', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Dorte' }));
    expect(screen.getByTestId('detalje')).toBeInTheDocument();

    // L2 = Familien: me, u1, u5 — Dorte er ikke med.
    fireEvent.change(screen.getByLabelText('Vis stilling for'), { target: { value: 'L2' } });
    expect(screen.queryByTestId('detalje')).toBeNull();
  });

  // Nummer ét er præcis den spiller, man vil kigge efter i sømmene. Var kun
  // tabellen klikbar, kunne top 3 aldrig foldes ud — de står på podiet.
  it('kan åbne en spiller fra podiet', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Anne' }));
    expect(screen.getByTestId('detalje')).toHaveTextContent('Anne');
  });

  // Slår man opdelingen til, byttes tabellen ud. Var navnene dér ikke
  // klikbare, forsvandt den eneste indgang til detaljen med den.
  it('kan åbne en spiller fra opdelingstabellen', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dorte' }));
    expect(screen.getByTestId('detalje')).toHaveTextContent('Dorte');
  });

  // En liga med PRÆCIS 3 spillere fylder podiet og har en tom liste. Lå
  // knappen og panelet inde i "listen har rækker", forsvandt begge features
  // for hele den gruppe — og knappen forsvandt for øjnene af en, der skiftede
  // filter fra "alle mine ligaer" til den lille liga.
  it('viser knap og spillerdetalje i en liga med præcis 3 spillere', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Vis stilling for'), { target: { value: 'L2' } });
    expect(container.querySelector('table')).toBeNull(); // ingen liste, kun podie
    expect(screen.getByRole('button', { name: /Hvor kommer pointene fra/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Erik' }));
    expect(screen.getByTestId('detalje')).toHaveTextContent('Erik');
  });
});

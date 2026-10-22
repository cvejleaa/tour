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

// `minUid` udstilles med vilje: uden den ville en fjernelse af propen i
// GameStandings være usynlig for suiten, og det indbyrdes opgør ville tavst
// aldrig dukke op i fladen. Mutationstestet.
vi.mock('./football/SpillerDetalje', () => ({
  default: ({ spiller, minUid }) => (
    <div data-testid="detalje" data-min-uid={minUid ?? ''}>{spiller.name}</div>
  ),
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
// `matches` skal kunne sendes ind: pokal-kortene regner rundesejre af
// kampprogrammet, og uden en vej hertil kunne wiringen ikke bevises —
// Pokaler ville stå med en tom liste og altid sige "ingen runder spillet".
function setup({ standings = ROWS, leagues = LEAGUES, matches = [] } = {}) {
  mockStandings.mockReturnValue({
    standings, leagues, leagueCount: leagues.length, loading: false, error: null,
  });
  // Skal stå på den rigtige rute: ellers falder GameTabLink tilbage til ren
  // tekst, og linkene ville være utestede.
  const r = render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route path="/spil/:gameId" element={<GameStandings gameId="sl" matches={matches} />} />
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
  it('beholder bestemt form i flertal — OG siger hvilken skala', () => {
    // Den flettede visning har ingen ét-svar-skala: den samme spiller kan stå
    // i to af mine ligaer med hver sin startrunde. Så må den sige, hvad den
    // regner på. Før stod der intet, og et tal uden skala er ikke et tal.
    setup();
    expect(screen.getByText(
      'Viser de 6 spillere, du deler liga med. Tæller fra runde 1 — spillets egen skala, ikke en ligas.',
    )).toBeInTheDocument();
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

  // Med én liga er der intet at VÆLGE imellem — men det er ikke det samme som
  // ingen liga. Testen her asserterede før KUN på vælgerens fravær og var
  // grøn, mens fanen viste spillets point i en liga, der tæller fra runde N.
  // Den forsvarede altså fejlen. Nu kræver den også, at ligaens tal står der.
  it('skjuler filteret, når man kun er med i én liga', () => {
    setup({ leagues: [LEAGUES[0]] });
    expect(screen.queryByLabelText('Vis stilling for')).not.toBeInTheDocument();
    // Og feltet er ligaens, ikke hele kredsen: Erik er ikke medlem af L1.
    expect(screen.getByText(/i Kontoret/)).toBeInTheDocument();
    expect(screen.queryByText('Erik')).toBeNull();
  });

  // KOMBINATIONEN, DER IKKE FANDTES I SUITEN: én liga MED startrunde. Begge
  // eksisterende startrunde-tests bygger et to-liga-fixture alene for at få
  // vælgeren frem, så ét-liga-vejen er aldrig blevet regnet på en anden skala.
  // Det var præcis dér, fejlen boede — ejeren så 47 point i stillingen og 9,7
  // i ligaen for samme spiller.
  describe('én liga med startrunde', () => {
    const LIGA12 = [{ id: 'L1', name: 'Familien', memberUids: ['me', 'u1'], startRound: 12 }];
    // Anne har 37,3 point FØR runde 12 og 9,7 i runde 12. Spillets total er
    // 47; ligaens er 9,7. Fixturet er bygget, så de to tal ikke kan forveksles.
    // Spillets regnskab (`opdeling`, summer til 47) og rubrikkerne pr. runde.
    // Tallene er valgt, så ligaens rubrikker (7,2 / +2,5 / 0 → 9,7) og
    // spillets (37,2 / +7,8 / 2 → 47) ikke deler ét eneste tal: en test, der
    // finder «7,2», kan ikke have fundet spillets kolonne.
    const MED_VEKTOR = [
      {
        uid: 'u1', name: 'Anne', totalPoints: 47, rank: 1, bonusPoints: 0,
        perRound: { 1: 37.3, 12: 9.7 },
        opdeling: { p1x2: 37.2, chance: 7.8, combi: 2, pulje: 0 },
        opdelingPerRunde: {
          1: { p1x2: 30, chance: 5.3, combi: 2 },
          12: { p1x2: 7.2, chance: 2.5, combi: 0 },
        },
      },
      {
        uid: 'me', name: 'Mig', totalPoints: 11.5, rank: 2, bonusPoints: 0,
        perRound: { 12: 11.5 },
        opdeling: { p1x2: 10, chance: 1.5, combi: 0, pulje: 0 },
        opdelingPerRunde: { 12: { p1x2: 10, chance: 1.5, combi: 0 } },
      },
    ];

    it('regner på LIGAENS skala, ikke spillets', () => {
      setup({ standings: MED_VEKTOR, leagues: LIGA12 });
      expect(screen.getByText('9,7')).toBeInTheDocument();
      // Og spillets tal må IKKE stå som Annes total. Uden denne ville testen
      // bestå med den gamle adfærd.
      expect(screen.queryByText('47')).toBeNull();
    });

    it('siger HVILKEN skala tallene er på', () => {
      setup({ standings: MED_VEKTOR, leagues: LIGA12 });
      expect(screen.getByText(/Tæller fra runde 12/)).toBeInTheDocument();
    });

    it('siger i spillerpanelet, at DETS tal er på en anden skala', () => {
      // Quality Controls B-4. Panelet får bevidst spillets total, fordi det
      // lister runder fra spillets start — men rækken ovenfor viser ligaens.
      // To tal for samme spiller på samme skærm uden ét ord er den modsigelse,
      // hele rettelsen handler om. Opdelings-tabellen har haft sin sætning
      // hele tiden; panelet havde ingen.
      setup({ standings: MED_VEKTOR, leagues: LIGA12 });
      // Rollen, ikke teksten: «Anne» står nu også på Chance-kongen-kortet.
      fireEvent.click(screen.getByRole('button', { name: 'Anne' }));
      expect(screen.getByText(/Tallene herunder er spillets samlede point/))
        .toBeInTheDocument();
      // Og den skal NAVNGIVE begge dele: spillets tal og ligaens startrunde.
      expect(screen.getByText(/47/)).toBeInTheDocument();
      expect(screen.getByText(/kun fra runde 12/)).toBeInTheDocument();
    });

    it('siger det IKKE, når de to tal er ens', () => {
      // Fraværs-siden. Uden den kunne betingelsen hardkodes til true, og
      // panelet ville forklare en forskel, læseren ikke kan se.
      //
      // FIXTURET SKAL RAMME "ENS", IKKE "MANGLER". Første udgave brugte en
      // liga UDEN startrunde — men da sætter `subsetRanking` slet ikke
      // `spilTotal`, så testen bestod på `!= null`-leddet og sagde intet om
      // sammenligningen. Mutationen "vis også når tallene er ens" overlevede.
      // Her har Mig ingen point før runde 12, så spillets og ligaens tal er
      // BEGGE 11,5 — og sætningen skal alligevel være væk.
      setup({ standings: MED_VEKTOR, leagues: LIGA12 });
      fireEvent.click(screen.getByText(/^Mig/));
      expect(screen.queryByText(/Tallene herunder er spillets samlede point/)).toBeNull();
    });

    it('vender ordenen: Anne fører spillet, men ikke ligaen', () => {
      // Kernen i hele fejlen. 47 > 11,5 på spillets skala; 9,7 < 11,5 på
      // ligaens. Rækkefølgen SKAL derfor bytte om.
      // To spillere giver intet podie (kræver mindst tre), så ordenen læses
      // i tabellen.
      setup({ standings: MED_VEKTOR, leagues: LIGA12 });
      const navne = tableRows().map(([, n]) => n.replace(' (dig)', '').trim());
      expect(navne).toEqual(['Mig', 'Anne']);
    });

    // REGNSKABET UNDER LIGAEN. Ejerens fund (20/10): med liga-filteret på
    // viste tabellen spillets samlede point — Team Sharkey 170,8 over Better
    // 159 — mens podiet var ligaens, og nr. 1 på podiet havde ikke flest
    // point i tabellen. Nu regner tabellen som ligaen af rubrikkerne pr.
    // runde, og I alt er stillingens tal.
    describe('regnskabet («Hvor kommer pointene fra?»)', () => {
      const aabn = () => fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
      /** Cellerne i regnskabstabellen, række for række — den eneste tabel, når regnskabet er åbent. */
      const regnskab = () => [...container.querySelectorAll('table tbody tr')]
        .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
      const tabel = () => within(container.querySelector('table'));
      /** Rækken uden de nævnte felter — «ikke genberegnet endnu»-fixtures. */
      const uden = (r, ...felter) => Object.fromEntries(Object.entries(r).filter(([k]) => !felter.includes(k)));

      it('regner rubrikkerne på LIGAENS skala — og I alt er stillingens tal', () => {
        setup({ standings: MED_VEKTOR, leagues: LIGA12 });
        aabn();
        // Ordenen er ligaens (Mig fører), puljekolonnen er væk (startrunde 12),
        // og hver celle er runde 12 alene.
        expect(regnskab()).toEqual([
          ['1. Mig (dig)', '10', '+1,5', '0', '11,5'],
          ['2. Anne', '7,2', '+2,5', '0', '9,7'],
        ]);
        // FRAVÆR: spillets tal står ikke i tabellen — hverken totalen eller
        // nogen rubrik. (Chance-kongen ovenfor viser stadig +7,8 for hele
        // sæsonen, mærket «hele sæsonen», så fraværet måles INDE i tabellen.)
        expect(screen.queryByText('47')).toBeNull();
        expect(tabel().queryByText('37,2')).toBeNull();
        expect(tabel().queryByText('+7,8')).toBeNull();
      });

      it('siger, at regnskabet tæller som ligaen — og IKKE, at det viser spillets point', () => {
        setup({ standings: MED_VEKTOR, leagues: LIGA12 });
        aabn();
        expect(screen.getByText(
          'Regnskabet tæller som ligaen: kun point fra runde 12 og frem, uden puljen. '
          + 'I alt er derfor det samme tal som i stillingen. Hele sæsonen for en spiller: tryk på navnet.',
        )).toBeInTheDocument();
        // Den gamle sætning var præcis modsigelsen: den må ikke overleve her.
        expect(screen.queryByText(/Regnskabet viser spillets samlede point/)).toBeNull();
      });

      it('skjuler puljekolonnen alle tre steder, når ligaen ikke tæller puljen', () => {
        setup({ standings: MED_VEKTOR, leagues: LIGA12 });
        aabn();
        // Overskrift, celler og forklaringslinjen («🎖️ Pulje: …») — ingen af dem.
        expect(screen.queryByText(/Pulje/)).toBeNull();
        expect(container.querySelectorAll('table thead th')).toHaveLength(5);
      });

      it('viser puljekolonnen og lægger puljen på, når ligaen tæller den', () => {
        // Startrunde 2 er inden for PULJE_MAKS_STARTRUNDE. Anne har 7 fra
        // puljen (bonusPoints) — spillets total 54, ligaens 9,7 + 7 = 16,7.
        const liga2 = [{ ...LIGA12[0], startRound: 2 }];
        const medPulje = [
          {
            ...MED_VEKTOR[0], totalPoints: 54, bonusPoints: 7,
            perRound: { 1: 37.3, 2: 9.7 },
            opdeling: { ...MED_VEKTOR[0].opdeling, pulje: 7 },
            opdelingPerRunde: { 1: MED_VEKTOR[0].opdelingPerRunde[1], 2: MED_VEKTOR[0].opdelingPerRunde[12] },
          },
          { ...MED_VEKTOR[1], perRound: { 2: 11.5 }, opdelingPerRunde: { 2: MED_VEKTOR[1].opdelingPerRunde[12] } },
        ];
        setup({ standings: medPulje, leagues: liga2 });
        aabn();
        expect(regnskab()).toEqual([
          ['1. Anne', '7,2', '+2,5', '0', '7', '16,7'],
          ['2. Mig (dig)', '10', '+1,5', '0', '0', '11,5'],
        ]);
        expect(screen.getAllByText(/Pulje/).length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/kun point fra runde 2 og frem\. I alt er derfor/)).toBeInTheDocument();
        expect(screen.queryByText(/uden puljen/)).toBeNull();
      });

      it('viser en streg og ligaens I alt for en spiller uden rubrikker pr. runde — og siger det', () => {
        // Anne er ikke genberegnet, siden feltet kom til. Hendes I alt er
        // stadig ligaens (vektoren findes), kun rubrikkerne mangler.
        setup({ standings: [uden(MED_VEKTOR[0], 'opdelingPerRunde'), MED_VEKTOR[1]], leagues: LIGA12 });
        aabn();
        expect(regnskab()[1]).toEqual(['2. Anne', '–', '–', '–', '9,7']);
        expect(screen.getByText(
          '– : For 1 spiller er pointene ikke delt op fra runde 12 endnu. '
          + 'Totalen er rigtig — kun opdelingen mangler. Bed admin køre 🔄 Genberegn point.',
        )).toBeInTheDocument();
      });

      it('tæller dem, der mangler — og bruger ALDRIG spil-tilstandens «bygges næste gang»', () => {
        setup({ standings: MED_VEKTOR.map((r) => uden(r, 'opdelingPerRunde')), leagues: LIGA12 });
        aabn();
        expect(screen.getByText(/– : For 2 spillere er pointene ikke delt op fra runde 12 endnu/)).toBeInTheDocument();
        // Den sætning gælder spillets regnskab, som serveren selv skriver ved
        // næste kamp. Her hjælper kun Genberegn, og det skal der stå.
        expect(screen.queryByText(/Opdelingen bygges/)).toBeNull();
      });

      it('viser en streg for en forældet opdeling, der mangler en talt runde (tilbagerulning)', () => {
        // Runde 12 blev afgjort, mens functions var rullet tilbage: vektoren
        // har nøglen, opdelingen har den ikke. Rubrikker for runde 1 alene
        // ville være et forkert tal for en liga fra runde 12.
        const anne = { ...MED_VEKTOR[0], opdelingPerRunde: { 1: MED_VEKTOR[0].opdelingPerRunde[1] } };
        setup({ standings: [anne, MED_VEKTOR[1]], leagues: LIGA12 });
        aabn();
        expect(regnskab()[1]).toEqual(['2. Anne', '–', '–', '–', '9,7']);
        expect(screen.getByText(/For 1 spiller er pointene ikke delt op/)).toBeInTheDocument();
      });

      it('viser «ikke klar» og ingen rang for en spiller med AFVIST rundevektor — og tæller hende ikke med', () => {
        // Vektoren FINDES, men kan ikke gengive spillets total (runde 1 mangler
        // i den: 9,7 mod 47), så ligaRanking afviser den (klar:false). Så må
        // rubrikkerne heller ikke regnes af den — tallene er lige så upålidelige
        // som totalen. Fixturet har feltet med VILJE: uden det ville
        // ligaOpdeling give null af sig selv, og vagten kunne fjernes ubemærket.
        const afvist = { ...MED_VEKTOR[0], perRound: { 12: 9.7 } };
        setup({ standings: [afvist, MED_VEKTOR[1]], leagues: LIGA12 });
        aabn();
        // Rangcellen er en streg (ligaRanking giver rank null), rubrikkerne
        // streger, og I alt er badget — ikke ligaRankings 0.
        expect(regnskab()[1]).toEqual(['– Anne', '–', '–', '–', 'ikke klar']);
        expect(tabel().queryByText('7,2')).toBeNull();
        // Badget siger det selv; stregens forklaring gælder kun rækker MED total.
        expect(screen.queryByText(/pointene ikke delt op/)).toBeNull();
      });

      it('sætter ingen stjerne, når rubrikkerne summer til ligaens total — heller ikke efter afrunding', () => {
        setup({ standings: MED_VEKTOR, leagues: LIGA12 });
        aabn();
        expect(screen.queryByText(/Delene summer ikke til totalen/)).toBeNull();
        expect(screen.queryByTitle(/Delene giver/)).toBeNull();
      });

      it('sætter en stjerne med gulv-teksten, når ligaens sum er i minus', () => {
        // Anne tabte 7 på Chancen i runde 12. Spillets total er 45 (ingen
        // gulv dér), men ligaen fra runde 12 ser −5 — og stillingen viser 0,
        // fordi saldoen aldrig går i minus. Rubrikkerne skal vise −5, og
        // stjernen skal sige HVORFOR de ikke summer til 0.
        const anne = {
          ...MED_VEKTOR[0], totalPoints: 45,
          perRound: { 1: 50, 12: -5 },
          opdeling: { p1x2: 52, chance: -7, combi: 0, pulje: 0 },
          opdelingPerRunde: { 1: { p1x2: 50, chance: 0, combi: 0 }, 12: { p1x2: 2, chance: -7, combi: 0 } },
        };
        setup({ standings: [anne, MED_VEKTOR[1]], leagues: LIGA12 });
        aabn();
        expect(regnskab()[1]).toEqual(['2. Anne', '2', '−7', '0', '0*']);
        expect(screen.getByTitle(/Delene giver -5 tilsammen\. Saldoen kan ikke gå i minus, så totalen står på 0\./))
          .toBeInTheDocument();
        expect(screen.getByText(/Delene summer ikke til totalen/)).toBeInTheDocument();
      });

      it('viser rubrikkerne MED stjerne — ikke en streg — ved en åben rest fra en kamp, der ikke kunne læses', () => {
        // Et tip med point på en slettet kamp: serveren lægger pointene under
        // nøglen «uden» i totalen, men i ingen rubrik. Det er permanent —
        // Genberegn hjælper ikke — så en streg med «bed admin køre Genberegn»
        // ville være en falsk anvisning. Samme kontrakt som spillets regnskab:
        // totalen er den rigtige, stjernen siger resten.
        const anne = {
          ...MED_VEKTOR[0], totalPoints: 50,
          perRound: { 1: 37.3, 12: 9.7, uden: 3 },
          opdelingPerRunde: { ...MED_VEKTOR[0].opdelingPerRunde, uden: { p1x2: 0, chance: 0, combi: 0 } },
        };
        setup({ standings: [anne, MED_VEKTOR[1]], leagues: LIGA12 });
        aabn();
        expect(regnskab()[0]).toEqual(['1. Anne', '7,2', '+2,5', '0', '12,7*']);
        expect(screen.getByTitle(/Delene giver 9,7 tilsammen, men totalen er 12,7/)).toBeInTheDocument();
        expect(screen.queryByText(/pointene ikke delt op/)).toBeNull();
      });

      it('holder panelets sætning om HELE sæsonen, når regnskabet er åbent', () => {
        // Regnskabet og panelet er nu på hver sin skala — med vilje (panelet
        // lister runder fra spillets start). Begge skal sige det.
        setup({ standings: MED_VEKTOR, leagues: LIGA12 });
        aabn();
        fireEvent.click(tabel().getByText('Anne'));
        expect(screen.getByText(/Tallene herunder er spillets samlede point/)).toBeInTheDocument();
      });
    });

    // REGRESSIONEN FRA EJERENS SKÆRMBILLEDE, i fixture-form: tre spillere, så
    // der ER et podie, og en liga fra runde 2. Sharkey fører spillet (170,8),
    // Better fører ligaen (139). Regnskabets orden skal være podiets, og ingen
    // række under nr. 1 må have et højere I alt.
    it('regnskabets orden er podiets — og nr. 1 har flest point i tabellen', () => {
      const liga2 = [{ id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1', 'u2'], startRound: 2 }];
      const rk = (p1x2) => ({ p1x2, chance: 0, combi: 0 });
      const tre = [
        {
          uid: 'u1', name: 'Sharkey', totalPoints: 170.8, rank: 1, bonusPoints: 0,
          perRound: { 1: 60, 2: 110.8 }, opdelingPerRunde: { 1: rk(60), 2: rk(110.8) },
        },
        {
          uid: 'u2', name: 'Better', totalPoints: 159, rank: 2, bonusPoints: 0,
          perRound: { 1: 20, 2: 139 }, opdelingPerRunde: { 1: rk(20), 2: rk(139) },
        },
        {
          uid: 'me', name: 'Mig', totalPoints: 110, rank: 3, bonusPoints: 0,
          perRound: { 1: 10, 2: 100 }, opdelingPerRunde: { 1: rk(10), 2: rk(100) },
        },
      ];
      setup({ standings: tre, leagues: liga2 });
      expect(podiumName(1)).toBe('Better');
      fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
      const raekker = [...container.querySelectorAll('table tbody tr')]
        .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
      expect(raekker.map((r) => r[0])).toEqual(['1. Better', '2. Sharkey', '3. Mig (dig)']);
      const iAlt = raekker.map((r) => Number(r[r.length - 1].replace(',', '.')));
      expect(iAlt).toEqual([139, 110.8, 100]);
      for (let i = 1; i < iAlt.length; i += 1) expect(iAlt[i]).toBeLessThanOrEqual(iAlt[0]);
      // Og spillets total — det tal, der SÅ ud som en fejl — står ingen steder.
      expect(screen.queryByText('170,8')).toBeNull();
    });
  });

  // Test Managers fund: `.includes(user?.uid)`-leddet i én-liga-vagten kunne
  // fjernes med hele suiten grøn. Ingen fixture havde en solo-liga, brugeren
  // ikke selv står i — netop det "skæve liga-dokument", kommentaren navngiver.
  it('lader IKKE en liga, jeg ikke står i, afgøre min skala', () => {
    // leagueMateUids springer sådan en liga over, så stillingen ville kun
    // rumme mig selv — og ligaRanking ville filtrere den sidste række væk mod
    // en medlemsliste uden mig. Uden vagten ville min egen stilling være tom.
    setup({
      standings: [ROWS[4]],
      leagues: [{ id: 'LX', name: 'Uden mig', memberUids: ['u1', 'u2'], startRound: 3 }],
    });
    // Den flettede visnings tekst ved præcis én synlig spiller. Det vigtige
    // er, at rækken IKKE er væk: uden vagten stod tabellen tom.
    expect(screen.getByText(/Viser kun dig selv/)).toBeInTheDocument();
    expect(screen.getByText(/Mig/)).toBeInTheDocument();
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
    // FØR: "du deler liga med" — den flettede visning. Den påstand er nu
    // forkert: med én tilbageværende liga ER den ligas skala stillingen, og
    // opsummeringen navngiver den. Testen er vendt bevidst, ikke lempet.
    expect(screen.getByText(/i Kontoret/)).toBeInTheDocument();
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
    // Testen målte før på ordet "Chancen" som stedfortræder for "tabellen er
    // foldet sammen". Den holdt op med at virke, da pokalkortet fik en
    // tom-tilstand med samme ord — en stedfortræder, der knækker, når en nabo
    // ændrer sig. Her assertes i stedet på RUBRIKKEN Combi, som kun
    // opdelingstabellen har.
    expect(screen.queryByText(/Combi/)).toBeNull();
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
    expect(screen.getByText(/Kupon-bonus: de ramte odds ganget sammen/)).toBeInTheDocument();
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

  // «Alle mine ligaer» er spillets skala, og det skal regnskabet blive ved
  // med at sige — liga-sætningen («tæller som ligaen») hører KUN til en liga
  // med startrunde. Fraværs-siden af liga-testen ovenfor.
  it('siger under «Alle mine ligaer», at regnskabet er spillets — med puljen', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.getByText(
      'Regnskabet viser spillets samlede point. Tæller fra runde 1 — spillets egen skala, ikke en ligas.',
    )).toBeInTheDocument();
    expect(screen.queryByText(/Regnskabet tæller som ligaen/)).toBeNull();
    expect(screen.getAllByText(/Pulje/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  // En liga UDEN startrunde er en delmængde af spillet — samme tal, ingen
  // skalasætning overhovedet (ligaGate er tom), og spillets rubrikker.
  it('viser spillets rubrikker uden skalasætning i en liga uden startrunde', () => {
    setup({ standings: MED });
    fireEvent.change(filter(), { target: { value: 'L1' } });
    fireEvent.click(screen.getByRole('button', { name: /Hvor kommer pointene fra/ }));
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.queryByText(/Regnskabet/)).toBeNull();
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

  it('giver panelet den KIGGENDES uid, så det indbyrdes opgør kan vises', () => {
    // Komplethed: at Indbyrdes virker isoleret beviser ikke, at Stilling
    // sender uid'et med. Uden denne test overlevede en fjernelse af propen
    // hele suiten — verificeret ved mutation.
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Anne' }));
    expect(screen.getByTestId('detalje')).toHaveAttribute('data-min-uid', 'me');
  });
});
describe('GameStandings — pokaler', () => {
  // KOMPLETHED, anden gang: at Pokaler virker isoleret beviser ikke, at
  // Stilling sender data videre. Fjernede man hele <Pokaler/> — eller bare
  // matches-proppen — stod alle 42 tests grønne, mens kortene aldrig ville
  // dukke op i produktionen. Derfor bindes tallet til de RIGTIGE matches.
  const KAMPE = [
    { round: 1, result: '1' },
    { round: 2, result: '1' },
    { round: 3, result: null },   // ikke færdig — må ikke tælle med
  ];
  const MED_RUNDER = [
    { uid: 'u1', name: 'Anne', totalPoints: 60, rank: 1, perRound: { 1: 10, 2: 8, 3: 99 } },
    { uid: 'u2', name: 'Bo', totalPoints: 40, rank: 2, perRound: { 1: 4, 2: 3, 3: 1 } },
  ];

  it('viser begge pokal-kort på fanen', () => {
    setup({ standings: MED_RUNDER, matches: KAMPE });
    expect(screen.getByText(/Rundekongen/)).toBeInTheDocument();
    expect(screen.getByText(/Chance-kongen/)).toBeInTheDocument();
  });

  it('regner rundesejre af de matches, Stilling sender med', () => {
    setup({ standings: MED_RUNDER, matches: KAMPE });
    // Anne vinder runde 1 og 2. Runde 3 er IKKE færdig, så hendes 99 dér
    // tæller ikke — uden matches-proppen ville tallet slet ikke kunne regnes.
    // Teksten er delt af <strong>, så der assertes på kortets samlede tekst.
    const kort = screen.getByText(/Rundekongen/).closest('.card');
    expect(kort.textContent).toContain('Anne');
    expect(kort.textContent).toContain('2 rundesejre');
    expect(kort.textContent).not.toContain('Bo');
  });

  it('sender LIGAENS startrunde med, så pokalen viser den rigtige skala', () => {
    // startRunde-proppen kunne fjernes, uden at noget blev rødt: kortene
    // ville tavst vise hele sæsonen for en liga, der tæller fra runde N.
    // To ligaer, så filteret overhovedet renderes — det vises først, når man
    // er med i mere end én.
    const medStart = [
      { id: 'L1', name: 'Kontoret', memberUids: ['u1', 'u2'], startRound: 2 },
      { id: 'L2', name: 'Familien', memberUids: ['u1', 'u2'] },
    ];
    setup({ standings: MED_RUNDER, matches: KAMPE, leagues: medStart });
    fireEvent.change(filter(), { target: { value: 'L1' } });

    const kort = screen.getByText(/Rundekongen/).closest('.card');
    expect(kort.textContent).toContain('fra runde 2');
    // Og tallet skal følge med: kun runde 2 tæller, ikke runde 1.
    expect(kort.textContent).toContain('1 rundesejr');
    expect(kort.textContent).not.toContain('2 rundesejre');
    // Chancen er spil-scoped og skal derfor sige det.
    expect(screen.getByText(/Chance-kongen/).closest('.card').textContent)
      .toContain('hele sæsonen');
  });

  it('siger det med ord, når ingen runde er spillet færdig', () => {
    setup({ standings: MED_RUNDER, matches: [{ round: 1, result: null }] });
    expect(screen.getByText(/Ingen runder er spillet færdig endnu/)).toBeInTheDocument();
  });
});


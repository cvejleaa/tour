// Tests for FootballTip — indkoblingen af Elo på kampkortene.
//
// Baggrund: hele <MatchElo/>-linjen kunne fjernes fra tip-fladen, uden at én
// af 1362 tests sagde fra. Denne fil dækker, at Elo faktisk NÅR ud på hvert
// kampkort — selve visningen er dækket i MatchElo.test.jsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockBets = vi.fn(() => ({ betsByMatch: {}, loading: false }));
vi.mock('../useGameBets', () => ({ useGameBets: () => mockBets() }));
vi.mock('../useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => ({ standings: [], leagues: [], leagueCount: 0, loading: false, error: null }),
}));
vi.mock('../betActions', () => ({ setBet: vi.fn().mockResolvedValue({ ok: true }) }));
import { setBet } from '../betActions';
vi.mock('./LeagueBets', () => ({ default: () => <div data-testid="liga-tips" /> }));
vi.mock('../../../components/ClubBadge', () => ({ default: () => <span /> }));
// Delingsteksten var slet ikke testet, så combi-tegnet havde to grene og kun
// den ene var dækket.
const mockShare = vi.fn().mockResolvedValue({ ok: true, mode: 'clipboard' });
vi.mock('../../../lib/share', () => ({ shareText: (...a) => mockShare(...a) }));

import { TRAEF_BONUS } from '../../../lib/superligaScoring';
import FootballTip from './FootballTip';

const KICKOFF = new Date('2026-09-01T18:00:00Z');
const KICKOFF2 = new Date('2026-09-08T18:00:00Z');
// To runder, så rundenavigationen (og ?runde=) har noget at navigere MELLEM.
// Begge ligger i fremtiden, så runde 1 er den aktive.
const MATCHES = [
  { id: 'm1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: KICKOFF, odds: null, result: null },
  { id: 'm2', round: 1, home: 'Brøndby IF', away: 'FC Midtjylland', kickoff: KICKOFF, odds: null, result: null },
  { id: 'm3', round: 2, home: 'F.C. København', away: 'Brøndby IF', kickoff: KICKOFF2, odds: null, result: null },
  { id: 'm4', round: 2, home: 'FC Midtjylland', away: 'AGF', kickoff: KICKOFF2, odds: null, result: null },
];

// To spillede runder, så der er udviklingspunkter at vise.
const HISTORY = [
  { round: 1, elo: { AGF: 1510, 'F.C. København': 1590, 'Brøndby IF': 1550, 'FC Midtjylland': 1450 } },
  { round: 2, elo: { AGF: 1525, 'F.C. København': 1620, 'Brøndby IF': 1540, 'FC Midtjylland': 1460 } },
];
// Navnene skal være dem fra seedet: eloHistory og kampenes home/away nøgles
// på name, ikke på forkortelsen. Bruger testen forkortelser, ville den bestå,
// selv om navne-matchningen var brudt i produktion.
const TEAMS = [
  { name: 'AGF', short: 'AGF', elo: 1500 },
  { name: 'F.C. København', short: 'FCK', elo: 1600 },
  { name: 'Brøndby IF', short: 'BIF', elo: 1560 },
  { name: 'FC Midtjylland', short: 'FCM', elo: 1440 },
];

// Runden ligger i URL'en, så komponenten skal stå i en router. Ruten matcher
// den rigtige (/spil/:gameId), så GameTabLink kan bygge sine stier.
function UrlProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}

const setup = (game = {}, url = '/spil/sl', matches = MATCHES) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route
        path="/spil/:gameId"
        element={(
          <FootballTip
            game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY, ...game }}
            me={{ uid: 'me', totalPoints: 100 }}
            matches={matches}
          />
        )}
      />
    </Routes>
    <UrlProbe />
  </MemoryRouter>,
);

// activeRound bygger på Date.now(), og kampene ligger i sep. 2026. Uden en
// frossen tid ville testen skifte betydning, når den dato passerer.
beforeEach(() => {
  vi.clearAllMocks();
  mockBets.mockReturnValue({ betsByMatch: {}, loading: false });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-02T08:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('FootballTip — Elo på kampkortene', () => {
  it('viser Elo for begge hold på hver kamp i runden', () => {
    setup();
    expect(screen.getByTitle('AGF: rating 1525')).toBeInTheDocument();
    expect(screen.getByTitle('F.C. København: rating 1620')).toBeInTheDocument();
    expect(screen.getByTitle('Brøndby IF: rating 1540')).toBeInTheDocument();
    expect(screen.getByTitle('FC Midtjylland: rating 1460')).toBeInTheDocument();
  });

  it('viser udviklingspunkterne pr. hold', () => {
    setup();
    // To spillede runder → to punkter.
    expect(screen.getByLabelText(/AGF: udvikling over de seneste 2 runder/).children).toHaveLength(2);
  });

  // Sæsonens virkelighed lige nu: præcis én spillet runde.
  it('viser ét punkt, når kun én runde er spillet', () => {
    setup({ eloHistory: [HISTORY[0]] });
    expect(screen.getByLabelText(/AGF: udvikling seneste runde/).children).toHaveLength(1);
    expect(screen.getByTitle('AGF: rating 1510')).toBeInTheDocument();
  });

  // Har spillet ingen egne hold, falder opslaget tilbage til Superliga-seedet.
  // Uden det ville kampkortene stå uden Elo for et spil, der ellers har historik.
  it('falder tilbage til Superliga-seedet, når spillet ikke har egne hold', () => {
    setup({ teams: undefined });
    expect(screen.getByTitle('AGF: rating 1525')).toBeInTheDocument();
  });

  it('viser start-rating, når ingen runder er spillet', () => {
    setup({ eloHistory: [] });
    expect(screen.getByTitle('AGF: rating 1500')).toBeInTheDocument();
    expect(screen.getAllByText(/Start-rating/).length).toBeGreaterThan(0);
  });

  // ── Runden i URL'en ────────────────────────────────────────────────────────
  // setup() tog imod en url, men ingen test brugte den: intet beviste, at
  // ?runde= bliver LÆST eller SKREVET.

  it('åbner den runde, URL\'en peger på', () => {
    setup({}, '/spil/sl?runde=2');
    expect(screen.getByText(/Runde 2 af/)).toBeInTheDocument();
  });

  it('viser den aktive runde, når URL\'en ikke siger noget', () => {
    setup();
    expect(screen.getByText(/Runde 1 af/)).toBeInTheDocument();
  });

  // Fixturet ovenfor har ALLE kampe i fremtiden, så gammelt og nyt rundevalg
  // giver samme svar — testene ovenfor består også, hvis man erstatter kaldet
  // til activeRound med "altid første runde". De to nedenfor er de eneste, der
  // beviser, at fladen faktisk bruger det rigtige valg.

  // Man sad og så rundens sidste kamp, trykkede opdatér, og var pludselig i
  // næste runde. Kampen, man kiggede på, var væk fra skærmen.
  it('bliver i runden, mens dens sidste kamp spilles', () => {
    const iGang = [
      { id: 'm1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: new Date('2026-08-02T07:30:00Z'), odds: null, result: null },
      { id: 'm3', round: 2, home: 'F.C. København', away: 'Brøndby IF', kickoff: KICKOFF2, odds: null, result: null },
    ];
    setup({}, '/spil/sl', iGang);
    expect(screen.getByText(/Runde 1 af/)).toBeInTheDocument();
  });

  it('går videre til næste runde, når den forrige er afgjort', () => {
    const afgjort = [
      { id: 'm1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: new Date('2026-08-02T07:30:00Z'), odds: null, result: '1' },
      { id: 'm3', round: 2, home: 'F.C. København', away: 'Brøndby IF', kickoff: KICKOFF2, odds: null, result: null },
    ];
    setup({}, '/spil/sl', afgjort);
    expect(screen.getByText(/Runde 2 af/)).toBeInTheDocument();
  });

  // En delt eller redigeret URL må ikke give en tom side.
  it('falder tilbage til den aktive runde ved en runde, der ikke findes', () => {
    setup({}, '/spil/sl?runde=99');
    expect(screen.getByText(/Runde 1 af/)).toBeInTheDocument();
  });

  it('ignorerer en ugyldig runde-parameter', () => {
    setup({}, '/spil/sl?runde=abc');
    expect(screen.getByText(/Runde 1 af/)).toBeInTheDocument();
  });

  it('skriver runden i URL\'en, når man bladrer', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Næste runde/ }));
    expect(screen.getByTestId('url').textContent).toContain('runde=2');
    expect(screen.getByText(/Runde 2 af/)).toBeInTheDocument();
  });

  // Fanen må ikke gå tabt, når runden skifter.
  it('bevarer fanen ved rundeskift', () => {
    setup({}, '/spil/sl?fane=tip&runde=1');
    fireEvent.click(screen.getByRole('button', { name: /Næste runde/ }));
    const url = screen.getByTestId('url').textContent;
    expect(url).toContain('fane=tip');
    expect(url).toContain('runde=2');
  });

  // Elo må ikke vælte tip-fladen for et spil, der slet ikke har ratings.
  it('viser stadig kampene, når spillet slet ingen Elo har', () => {
    const { container } = setup({ teams: [], eloHistory: undefined });
    const navne = [...container.querySelectorAll('.match-card__side-name')].map((e) => e.textContent);
    expect(navne).toContain('AGF');
    expect(navne).toContain('FC Midtjylland');
    // KORTKODEN ER VÆK FRA KAMPKORTET. Den blev vist på smal skærm, indtil det
    // viste sig, at spillerne ikke ved hvad forkortelserne betyder. Navnet
    // ombrydes i stedet — se navnVisning.test.js for selve ombrydningen; jsdom
    // anvender ingen CSS, så den her kan kun se markuppen.
    expect(container.querySelectorAll('.match-card__side-code')).toHaveLength(0);
  });

  // HOLDNAVNET SKAL STÅ FULDT UD — ikke som en forkortelse. Det var hele
  // grunden til at fjerne kortkoden: spillerne kunne ikke tyde den.
  it('viser holdets fulde navn på begge sider af kortet', () => {
    const { container } = setup({
      teams: [
        { name: 'FC Midtjylland', short: 'FCM', elo: 1657 },
        { name: 'AGF', short: 'ÅRH', elo: 1578 },
      ],
    });
    const navne = [...container.querySelectorAll('.match-card__side-name')].map((e) => e.textContent);
    expect(navne).toContain('FC Midtjylland');
    expect(navne).toContain('AGF');
    // Og ingen af dem må være kortkoden.
    expect(navne).not.toContain('FCM');
    expect(navne).not.toContain('ÅRH');
  });
});

// ---------------------------------------------------------------------------
// Slutresultatet på kampkortet.
//
// Målene har ligget på kampdokumentet siden sæsonstart, men blev ikke vist
// nogen steder: pladsen mellem holdnavnene var en hardkodet streg. Kortet
// kunne altså på én gang sige "Ramt +6,0" og lade som om resultatet var ukendt.
// ---------------------------------------------------------------------------
describe('FootballTip — slutresultat på kampkortet', () => {
  const SPILLET = new Date('2026-08-01T16:00:00Z'); // før den frosne tid

  const spillede = (extra = {}) => ([
    {
      id: 'p1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: SPILLET,
      odds: { 1: 3.4, X: 6, 2: 1.8 }, result: '1', homeGoals: 3, awayGoals: 2, ...extra,
    },
  ]);

  it('viser scoren, når kampen er spillet', () => {
    setup({}, '/spil/sl', spillede());
    expect(screen.getByLabelText(/Slutresultat/)).toHaveTextContent('3 – 2');
  });

  it('nævner begge hold ved navn for skærmlæsere', () => {
    setup({}, '/spil/sl', spillede());
    // "3 – 2" alene oplæses uforudsigeligt; tallene skal knyttes til holdene.
    expect(screen.getByLabelText('Slutresultat: AGF 3, F.C. København 2')).toBeInTheDocument();
  });

  it('viser 0-0 i stedet for at skjule kampen', () => {
    setup({}, '/spil/sl', spillede({ result: 'X', homeGoals: 0, awayGoals: 0 }));
    expect(screen.getByLabelText(/Slutresultat/)).toHaveTextContent('0 – 0');
  });

  it('beholder stregen på en kamp, der ikke er spillet', () => {
    const { container } = setup();   // MATCHES ligger alle i fremtiden
    expect(screen.queryByLabelText(/Slutresultat/)).toBeNull();
    expect(container.querySelectorAll('.match-card__dash').length).toBeGreaterThan(0);
  });

  it('beholder stregen, når facit er sat men målene mangler', () => {
    // Kan ikke opstå fremadrettet (synken skriver dem sammen), men et gammelt
    // dokument må vise en streg frem for "NaN – NaN".
    setup({}, '/spil/sl', [{
      id: 'p2', round: 1, home: 'AGF', away: 'F.C. København', kickoff: SPILLET,
      odds: null, result: '1',
    }]);
    expect(screen.queryByLabelText(/Slutresultat/)).toBeNull();
  });

  it('markerer det udfald, der faktisk blev til noget', () => {
    const { container } = setup({}, '/spil/sl', spillede());
    const vundet = container.querySelectorAll('.pick--won');
    expect(vundet).toHaveLength(1);              // præcis ét udfald pr. kamp
    expect(vundet[0]).toHaveTextContent('1');    // hjemmesejr 3-2
  });

  // Klassen bærer CSS'en i theme.css. Uden en assertion kan stilarten dø
  // ubemærket, og scoren ville se ud som den streg, den erstattede.
  it('scoren bærer sin egen klasse (så CSS\'en ikke kan dø ubemærket)', () => {
    const { container } = setup({}, '/spil/sl', spillede());
    expect(container.querySelectorAll('.match-card__score')).toHaveLength(1);
    expect(container.querySelectorAll('.match-card__dash')).toHaveLength(0);
  });

  it('en afgjort kamp lover ikke længere point for at gætte rigtigt', () => {
    setup({}, '/spil/sl', spillede());
    const vinder = screen.getByTitle('1 blev udfaldet');
    expect(vinder).toBeInTheDocument();
    // De to tabende udfald beholder deres odds-tekst; kun vinderen skifter.
    expect(screen.getAllByTitle(/point hvis rigtigt/)).toHaveLength(2);
    expect(vinder.title).not.toMatch(/hvis rigtigt/);
    // TEKSTEN SKAL BINDES, ikke bare tælles. Med træf-bonussen på 0 må der
    // ikke stå "+ 0 for at ramme" — og sættes skruen igen, skal tooltip'et
    // følge med. En ren optælling ville lyse grønt i begge tilfælde.
    for (const el of screen.getAllByTitle(/point hvis rigtigt/)) {
      expect(el.title).not.toMatch(/\+ 0 for at ramme/);
      expect(el.title).toMatch(TRAEF_BONUS > 0 ? /\+ \d/ : /kampens odds/);
    }
  });

  it('markerer intet udfald, før kampen er afgjort', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.pick--won')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Levende stilling på kampkortet.
//
// Den vigtigste risiko er ikke teknisk: forveksler man en LEVENDE 1-0 med et
// ENDELIGT 1-0, tror man kampen er slut og lukker siden. Derfor tre
// uafhængige kanaler — pillen, teksten under tallet, og oplæsningen.
// ---------------------------------------------------------------------------
describe('FootballTip — kampen er i gang', () => {
  const NU = Date.parse('2026-08-02T08:00:00Z');   // samme frosne tid som ovenfor
  const IGANG = new Date(NU - 40 * 60000);

  const kampe = (live, extra = {}) => ([{
    id: 'L1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: IGANG,
    odds: { 1: 3.4, X: 6, 2: 1.8 }, result: null, live, ...extra,
  }]);
  const frisk = { liveHeartbeatAt: NU - 30_000 };
  const LIVE = { home: 1, away: 0, status: 'anden', statusRaw: '2nd half', at: NU - 10 * 60000 };

  it('viser den levende stilling', () => {
    setup(frisk, '/spil/sl', kampe(LIVE));
    expect(screen.getByLabelText(/Stillingen lige nu/)).toHaveTextContent('1 – 0');
  });

  it('siger DIREKTE med halvleg i stedet for "Låst"', () => {
    setup(frisk, '/spil/sl', kampe(LIVE));
    expect(screen.getByText(/DIREKTE · 2\. halvleg/)).toBeInTheDocument();
    expect(screen.queryByText('Låst')).toBeNull();
  });

  // Den afgørende forskel: en levende stilling må ikke oplæses som et facit.
  it('oplæses som en stilling under en kamp — ikke som et slutresultat', () => {
    setup(frisk, '/spil/sl', kampe(LIVE));
    expect(screen.queryByLabelText(/Slutresultat/)).toBeNull();
    const m = screen.getByLabelText(/Stillingen lige nu/);
    expect(m.getAttribute('aria-label')).toMatch(/AGF 1, F\.C\. København 0/);
    expect(m.getAttribute('aria-label')).toMatch(/Kampen er i gang, 2\. halvleg/);
  });

  // De fire klasser bærer hele den visuelle skelnen mellem levende og endelig.
  // Uden assertions kunne CSS'en dø ubemærket, og så stod en levende stilling
  // og lignede et facit.
  it('bærer sine egne klasser, så stilarten ikke kan dø ubemærket', () => {
    const { container } = setup(frisk, '/spil/sl', kampe(LIVE));
    expect(container.querySelectorAll('.live-pill')).toHaveLength(1);
    expect(container.querySelectorAll('.live-pill__prik')).toHaveLength(1);
    expect(container.querySelectorAll('.match-card__score--live')).toHaveLength(1);
    expect(container.querySelectorAll('.match-card__score--doed')).toHaveLength(0);
    expect(container.querySelectorAll('.match-card__dash')).toHaveLength(0);
  });

  it('dæmper BÅDE pillen og tallet, når opdateringen er stoppet', () => {
    const { container } = setup({ liveHeartbeatAt: NU - 30 * 60000 }, '/spil/sl', kampe(LIVE));
    expect(container.querySelectorAll('.live-pill--doed')).toHaveLength(1);
    expect(container.querySelectorAll('.match-card__score--doed')).toHaveLength(1);
    expect(container.querySelectorAll('.live-pill__prik')).toHaveLength(0); // ingen puls, ingen prik
  });

  // Klokkeslættet er den tredje kanal. Bundet til sit eget element, ikke til
  // en løs tekstsøgning, så en tom streng ikke kan snige sig forbi.
  it('viser klokkeslættet for seneste opdatering under tallet', () => {
    const { container } = setup({ liveHeartbeatAt: Date.parse('2026-08-02T08:00:00Z') - 60_000 },
      '/spil/sl', kampe(LIVE));
    const note = container.querySelector('.match-card__score-note');
    expect(note).not.toBeNull();
    expect(note.textContent).toMatch(/^\d{2}[.:]\d{2}$/);   // fx "09.59"
  });

  it('sætter "sidst" foran klokkeslættet, når opdateringen er stoppet', () => {
    const { container } = setup({ liveHeartbeatAt: NU - 30 * 60000 }, '/spil/sl', kampe(LIVE));
    expect(container.querySelector('.match-card__score-note').textContent).toMatch(/^sidst \d{2}[.:]\d{2}$/);
  });

  // Panelet vælger kampen ÉN gang ved montering. Tipper man sin første kamp,
  // mens panelet står åbent, gik listen fra tom til fyldt uden at valget fulgte
  // med — og <select> viste den første kamp, mens state stadig var tom. Så
  // påstod boksen "Odds er ikke lagt ind på kampen endnu", selv om oddsene stod
  // på knapperne lige ovenover, og knappen var død. Man kunne ikke sætte Chancen.
  it('vælger kampen, når man tipper sin FØRSTE kamp med panelet åbent', () => {
    const medOdds = [
      { id: 'm1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: KICKOFF, odds: { 1: 2.2, X: 4.1, 2: 3.4 }, result: null },
    ];
    // En FUNKTION, ikke en konstant: genbruger man samme element-reference i
    // render og rerender, springer React gentegningen over, og testen måler
    // ingenting.
    const tree = () => (
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={(
              <FootballTip
                game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY }}
                me={{ uid: 'me', totalPoints: 100 }}
                matches={medOdds}
              />
            )}
          />
        </Routes>
      </MemoryRouter>
    );

    mockBets.mockReturnValue({ betsByMatch: {}, loading: false });
    const { rerender } = render(tree());
    expect(screen.getByText(/Tip mindst én kamp i runden først/)).toBeInTheDocument();

    // Brugeren tipper kampen — panelet står stadig åbent.
    mockBets.mockReturnValue({ betsByMatch: { m1: { matchId: 'm1', pick: '1' } }, loading: false });
    rerender(tree());

    expect(screen.queryByText(/Odds er ikke lagt ind/)).toBeNull();
    // Det, der faktisk blokerede: knappen var deaktiveret, fordi `pick` blev
    // undefined sammen med kampen. Man kunne se panelet og ikke bruge det.
    expect(screen.getByRole('button', { name: /Aktivér Chancen/ })).toBeEnabled();
  });

  // Live har forrang over Chancen-pillen: chance-kampen er den, man følger tættest.
  it('lader live vinde over Chancen-pillen', () => {
    // Chancen kommer fra TIPPET, ikke fra spillet — og chance-kampen er
    // netop den, man følger tættest, så den må ikke miste sin live-markering.
    mockBets.mockReturnValue({
      betsByMatch: { L1: { pick: '1', chanceStake: 10 } }, loading: false,
    });
    const { container } = setup(frisk, '/spil/sl', kampe(LIVE));
    expect(screen.getByText(/DIREKTE/)).toBeInTheDocument();
    // Kun pillen PÅ KORTET — "Chancen" står også som overskrift i panelet nedenfor.
    expect(container.querySelectorAll('.match-card .chance-pill')).toHaveLength(0);
    expect(container.querySelectorAll('.match-card .live-pill')).toHaveLength(1);
  });

  it('siger "Afbrudt" i stedet for DIREKTE, når kampen er afbrudt', () => {
    setup(frisk, '/spil/sl', kampe({ ...LIVE, status: 'afbrudt' }));
    expect(screen.getByText('Afbrudt')).toBeInTheDocument();
    expect(screen.queryByText(/DIREKTE/)).toBeNull();
  });

  // REGRESSIONEN. Første udgave slettede live-feltet ved slutfløjt, og så stod
  // kortet med en streg, mens brugeren stadig troede, kampen var i gang.
  // Tallet SKAL blive stående, indtil facit lander.
  it('beholder stillingen og siger "Slut · afventer facit"', () => {
    setup(frisk, '/spil/sl', kampe({ ...LIVE, status: 'slut' }));
    expect(screen.getByText(/Slut · afventer facit/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Stillingen ved slutfløjt/)).toHaveTextContent('1 – 0');
    expect(screen.queryByText(/DIREKTE/)).toBeNull();
  });

  // Uden disse assertions kan man fjerne HELE den visuelle forskel på "slut"
  // og "i gang", og alle tests bliver grønne: teksten ville sige "Slut", mens
  // den pulserende røde direkte-prik stod ved siden af, og tallet stod i
  // levende rød. Mutationstesten fandt præcis det hul.
  it('dæmper BÅDE pillen og tallet på en sluttet kamp — og viser ingen levende prik', () => {
    const { container } = setup(frisk, '/spil/sl', kampe({ ...LIVE, status: 'slut' }));
    expect(container.querySelectorAll('.live-pill--doed')).toHaveLength(1);
    expect(container.querySelectorAll('.match-card__score--doed')).toHaveLength(1);
    expect(container.querySelectorAll('.live-pill__prik')).toHaveLength(0);
  });

  // ⏸ er "noget er galt". Slutfløjt er ikke en fejl, og må ikke se ud som en.
  it('bruger målflaget, ikke pause-tegnet, når kampen er slut', () => {
    setup(frisk, '/spil/sl', kampe({ ...LIVE, status: 'slut' }));
    expect(screen.getByText(/🏁/)).toBeInTheDocument();
    expect(screen.queryByText(/⏸/)).toBeNull();
  });

  it('skriver "ved slutfløjt" under tallet i stedet for et klokkeslæt', () => {
    const { container } = setup(frisk, '/spil/sl', kampe({ ...LIVE, status: 'slut' }));
    expect(container.querySelector('.match-card__score-note').textContent).toBe('ved slutfløjt');
  });

  // Skærmlæseren er den eneste, der ikke kan se pillen. Uden det her mister
  // den helt beskeden om, at tallet er foreløbigt.
  it('oplæser en sluttet kamp som slut — uden at love en opdatering', () => {
    setup(frisk, '/spil/sl', kampe({ ...LIVE, status: 'slut' }));
    const m = screen.getByLabelText(/Stillingen ved slutfløjt/);
    expect(m.getAttribute('aria-label')).toContain('Kampen er slut, det officielle resultat er ikke nået frem endnu.');
    expect(m.getAttribute('aria-label')).not.toMatch(/Opdateret|Opdateringen er afbrudt/);
  });

  // "Opdatering afbrudt" ville være en løgn på en sluttet kamp: synken fejler
  // ikke, den venter på resultatet. Derfor går `sluttet` forrest.
  it('siger ikke "Opdatering afbrudt" på en kamp, der er slut', () => {
    // Pulsen er gammel — uden forrangen ville kortet melde afbrudt opdatering.
    setup({ liveHeartbeatAt: NU - 60 * 60_000 }, '/spil/sl', kampe({ ...LIVE, status: 'slut' }));
    expect(screen.getByText(/Slut · afventer facit/)).toBeInTheDocument();
    expect(screen.queryByText(/Opdatering afbrudt/)).toBeNull();
  });

  // Vi sletter aldrig stillingen — vi siger, hvornår den sidst blev set.
  it('dæmper i stedet for at lyve, når opdateringen er stoppet', () => {
    setup({ liveHeartbeatAt: NU - 30 * 60000 }, '/spil/sl', kampe(LIVE));
    expect(screen.getByText(/Opdatering afbrudt/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Stillingen lige nu/)).toHaveTextContent('1 – 0');
  });

  // Uden et eget ur ville forbeholdet aldrig komme frem: gentegningerne under
  // en kamp kommer fra pulsen, og stopper synken, stopper pulsen med den.
  // Kortet ville fryse på "DIREKTE" i præcis det tilfælde, forbeholdet
  // findes for. Her gives INGEN nye props — kortet skal selv opdage det.
  it('bliver forældet af sig selv, når pulsen holder op', async () => {
    setup({ liveHeartbeatAt: NU - 60_000 }, '/spil/sl', kampe(LIVE));
    expect(screen.getByText(/DIREKTE/)).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(6 * 60_000); });

    expect(screen.getByText(/Opdatering afbrudt/)).toBeInTheDocument();
    expect(screen.queryByText(/DIREKTE/)).toBeNull();
  });

  // Uret må kun køre, mens der faktisk er noget at følge — ellers gentegner
  // hver eneste tip-side hvert halve minut resten af sæsonen.
  it('sætter kun et ur, når en kamp faktisk er i gang', () => {
    const { unmount } = setup(frisk, '/spil/sl', kampe(null));
    expect(vi.getTimerCount()).toBe(0);
    unmount();

    setup(frisk, '/spil/sl', kampe(LIVE));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('bliver IKKE forældet, mens pulsen stadig er frisk', async () => {
    setup({ liveHeartbeatAt: NU - 60_000 }, '/spil/sl', kampe(LIVE));
    await act(async () => { vi.advanceTimersByTime(2 * 60_000); });
    expect(screen.getByText(/DIREKTE/)).toBeInTheDocument();
  });

  it('viser stregen igen, når kampen hverken er i gang eller spillet', () => {
    const { container } = setup(frisk, '/spil/sl', kampe(null));
    expect(screen.queryByLabelText(/Stillingen lige nu/)).toBeNull();
    expect(container.querySelectorAll('.match-card__dash').length).toBeGreaterThan(0);
  });

  it('viser slutresultatet, ikke live, når kampen er afgjort', () => {
    setup(frisk, '/spil/sl', kampe(LIVE, { result: '1', homeGoals: 3, awayGoals: 2 }));
    expect(screen.getByLabelText(/Slutresultat/)).toHaveTextContent('3 – 2');
    expect(screen.queryByText(/DIREKTE/)).toBeNull();
  });
});

// --- Splittet runde: hvad ser spilleren, når en kamp er udsat? ---------------
//
// Skærmen er dét, der møder spillerne fredag kl. 19. Reglen selv er dækket i
// pointOpdeling.test.js; her handler det om, at man kan SE hvilke kampe der
// tæller i combi'en — uden at læse hjælpesiden.
describe('FootballTip — kuponen i en splittet runde', () => {
  const UGE = new Date('2026-08-07T17:00:00Z');   // fredag i rundens uge
  const UGE2 = new Date('2026-08-09T15:00:00Z');  // søndag, samme uge
  const SENT = new Date('2026-09-02T17:00:00Z');  // udsat ~4 uger

  // Fire kampe i ugen + to udsatte: præcis formen på runde 3 i 2026/27.
  const splittet = [
    { id: 's1', round: 3, home: 'AGF', away: 'F.C. København', kickoff: UGE, odds: null, result: null },
    { id: 's2', round: 3, home: 'Brøndby IF', away: 'FC Midtjylland', kickoff: UGE, odds: null, result: null },
    { id: 's3', round: 3, home: 'F.C. København', away: 'Brøndby IF', kickoff: UGE2, odds: null, result: null },
    { id: 's4', round: 3, home: 'FC Midtjylland', away: 'AGF', kickoff: UGE2, odds: null, result: null },
    { id: 's5', round: 3, home: 'AGF', away: 'FC Midtjylland', kickoff: SENT, odds: null, result: null },
    { id: 's6', round: 3, home: 'F.C. København', away: 'AGF', kickoff: SENT, odds: null, result: null },
  ];
  // Samme runde UDEN udsættelser — kontrolgruppen.
  const samlet = splittet.slice(0, 4);

  it('mærker hver kamp med om den er på kuponen', () => {
    setup({}, '/spil/sl?runde=3', splittet);
    expect(screen.getAllByTestId('kupon-med')).toHaveLength(4);
    expect(screen.getAllByTestId('kupon-uden')).toHaveLength(2);
  });

  // Mærket skal betyde noget. Står det på hvert kort i hver runde, holder man
  // op med at se det — og så virker det ikke den ene gang, det gælder.
  it('mærker INTET, når hele runden ligger i samme uge', () => {
    setup({}, '/spil/sl?runde=3', samlet);
    expect(screen.queryByTestId('kupon-med')).toBeNull();
    expect(screen.queryByTestId('kupon-uden')).toBeNull();
  });

  it('siger øverst hvilke kampe der er rykket, og hvornår', () => {
    setup({}, '/spil/sl?runde=3', splittet);
    const note = screen.getByTestId('combi-udenfor');
    expect(note).toHaveTextContent('2 kampe i runden ligger uden for rundens uge');
    expect(note).toHaveTextContent('AGF–FC Midtjylland');
    expect(note).toHaveTextContent('F.C. København–AGF');
    expect(note).toHaveTextContent(/sep/);
  });

  it('viser ingen udsat-note, når runden er hel', () => {
    setup({}, '/spil/sl?runde=3', samlet);
    expect(screen.queryByTestId('combi-udenfor')).toBeNull();
  });

  // Der er INTET kuponkrav. Kortet må aldrig sige "for at være med" — man ER
  // med, også med ét tip. Sagde det noget andet, ville spilleren tro, at en
  // glemt kamp havde kostet ham hele bonussen.
  it('stiller ikke krav om at have tippet hele kuponen', () => {
    setup({}, '/spil/sl?runde=3', splittet);
    const kort = screen.getByTestId('combi-kort');
    expect(kort).not.toHaveTextContent(/for at være med/);
    expect(kort).toHaveTextContent(/I spil/);
    expect(kort).toHaveTextContent(/koster dig ikke bonussen/);
  });

  // Men opfordringen skal stå der: hver ekstra ramt kamp ganger bonussen op.
  it('siger hvor mange af kuponens kampe der mangler', () => {
    mockBets.mockReturnValue({ betsByMatch: { s1: { pick: '1' }, s2: { pick: 'X' } }, loading: false });
    setup({}, '/spil/sl?runde=3', splittet);
    expect(screen.getByTestId('combi-mangler')).toHaveTextContent('Du mangler 2 af kuponens 4 kampe');
  });

  it('siger intet om manglende tips, når kuponen er fuldt tippet', () => {
    mockBets.mockReturnValue({
      betsByMatch: { s1: { pick: '1' }, s2: { pick: 'X' }, s3: { pick: '2' }, s4: { pick: '1' } },
      loading: false,
    });
    setup({}, '/spil/sl?runde=3', splittet);
    expect(screen.queryByTestId('combi-mangler')).toBeNull();
  });

  // Combi'en er I SPIL, så snart de fire på kuponen er tippet — også selv om
  // de to udsatte står urørte. Ventede kortet på dem, ville det sige "du er
  // ikke med" til en spiller, der ER med.
  it('er i spil, når kuponens fire er tippet — uanset de udsatte', () => {
    mockBets.mockReturnValue({
      betsByMatch: {
        s1: { pick: '1' }, s2: { pick: 'X' }, s3: { pick: '2' }, s4: { pick: '1' },
      },
      loading: false,
    });
    setup({}, '/spil/sl?runde=3', splittet);
    expect(screen.getByTestId('combi-kort')).toHaveTextContent(/I spil/);
    expect(screen.getByTestId('combi-kort')).not.toHaveTextContent(/Tip alle/);
  });

  // Den, der tipper ALLE seks, skal også være med. Tælles der på rundens kampe
  // i stedet for kuponens, får den grundigste spiller besked om, at han ikke er
  // med — mens den, der kun tippede de fire, er.
  it('er i spil, også når man har tippet de udsatte oveni', () => {
    mockBets.mockReturnValue({
      betsByMatch: {
        s1: { pick: '1' }, s2: { pick: 'X' }, s3: { pick: '2' }, s4: { pick: '1' },
        s5: { pick: '1' }, s6: { pick: 'X' },
      },
      loading: false,
    });
    setup({}, '/spil/sl?runde=3', splittet);
    expect(screen.getByTestId('combi-kort')).toHaveTextContent(/I spil/);
    expect(screen.getByTestId('combi-kort')).not.toHaveTextContent(/Tip alle/);
  });

  // Datospændet i headeren følger kuponen. Før stod der "7. aug. – 2. sep." om
  // en runde, der gøres op den 9.
  it('viser kuponens datospænd i headeren, ikke de udsattes', () => {
    const { container } = setup({}, '/spil/sl?runde=3', splittet);
    const head = container.querySelector('.round-head__title');
    expect(head).toHaveTextContent('Runde 3');
    expect(head).not.toHaveTextContent(/sep/);
  });
});

// --- Chancen: den gemte indsats -------------------------------------------
//
// Brugerens ord: "man kan ikke se hvor meget man har satset i chancen".
// Det viste sig at være mere end en manglende visning. `stake` blev sat ÉN
// gang ved montering, og tips hentes asynkront — fladen venter kun på
// KAMPENE. Panelet monteredes derfor med betsByMatch = {}, tælleren stod på
// CHANCE.MIN, "Rammer du"-linjen viste tallene for et væddemål, man ikke havde
// indgået, og "Opdatér Chancen" skrev 1 oven i en indsats på 4.
describe('Chancen — den gemte indsats', () => {
  // Kampen skal have odds, ellers viser panelet "Odds er ikke lagt ind" i
  // stedet for den linje, indsatsen kan aflæses på.
  const MED_ODDS = MATCHES.map((m) => (
    m.id === 'm1' ? { ...m, odds: { 1: 3.9, X: 3.5, 2: 2.0 } }
      : m.id === 'm2' ? { ...m, odds: { 1: 2.2, X: 3.4, 2: 3.1 } } : m
  ));

  const tegn = (bets, { matches = MED_ODDS, me = { uid: 'me', totalPoints: 100 }, url = '/spil/sl' } = {}) => {
    mockBets.mockReturnValue({ betsByMatch: bets, loading: false });
    return (
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={(
              <FootballTip
                game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY }}
                me={me}
                matches={matches}
              />
            )}
          />
        </Routes>
      </MemoryRouter>
    );
  };

  it('viser den gemte indsats, når tippene lander EFTER første render', () => {
    const { rerender } = render(tegn({}));
    rerender(tegn({ m1: { pick: '1', chanceStake: 4 } }));

    expect(screen.getByRole('button', { name: /Opdatér Chancen/ })).toBeInTheDocument();
    // Med odds 3,90 og indsats 4: +11,6 → +12 ved gevinst, −4 ved tab.
    // Med den forkerte indsats 1 stod der +3 og −1.
    const linje = screen.getByText(/Rammer du:/);
    expect(linje).toHaveTextContent('−4');
    expect(linje).not.toHaveTextContent('−1');
  });

  // Chancen ligger med vilje på rundens ANDEN kamp: lå den på den første i
  // hver eneste test, kunne opslaget erstattes med roundMatches[0], uden at
  // noget fejlede — og så beviser linjen ikke, at det er den rigtige kamp,
  // der navngives.
  it('navngiver den kamp, chancen faktisk står på', () => {
    render(tegn({ m2: { pick: '2', chanceStake: 4 } }));
    const linje = screen.getByText(/På spil nu:/);
    expect(linje).toHaveTextContent('4 point');
    expect(linje).toHaveTextContent('Brøndby IF–FC Midtjylland');
    expect(linje).toHaveTextContent('(2)');
    expect(linje).not.toHaveTextContent('AGF');
  });

  // OUTCOME_LABEL-opslaget: 'X' er den, der let falder igennem, fordi den
  // hverken er 1 eller 2.
  it('skriver X som valg, når chancen står på uafgjort', () => {
    render(tegn({ m1: { pick: 'X', chanceStake: 2 } }));
    expect(screen.getByText(/På spil nu:/)).toHaveTextContent('(X)');
  });

  // TRE TILSTANDE, hvor tallet var usynligt, mens der var point i spil. Alle
  // tre er helt almindelige — ikke kanttilfælde.

  // 1) Hele runden er låst: det meste af ugen. `options` filtrerer låste kampe
  //    fra, så panelet faldt i "Tip mindst én kamp i runden først" — en direkte
  //    usand sætning, når man har 4 point på spil.
  it('viser den gemte indsats, også når hele runden er låst', () => {
    vi.setSystemTime(new Date('2026-09-02T08:00:00Z')); // efter runde 1s kickoff
    render(tegn({ m1: { pick: '1', chanceStake: 4 } }, { url: '/spil/sl?runde=1' }));
    const linje = screen.getByText(/På spil nu:/);
    expect(linje).toHaveTextContent('4 point');
    // "Tip mindst én kamp i runden først" er usandt her: man HAR tippet, og
    // man kan under ingen omstændigheder nå at gøre det, sætningen beder om.
    expect(screen.queryByText(/Tip mindst én kamp i runden først/)).not.toBeInTheDocument();
    // Med en aktiv chance på en låst kamp er den præcise besked den rigtige.
    expect(screen.getByText(/Chancen er brugt i denne runde/)).toBeInTheDocument();
  });

  // Uden en aktiv chance er det runden — ikke chancen — der er låst.
  it('siger at RUNDEN er låst, når der ingen chance er sat', () => {
    vi.setSystemTime(new Date('2026-09-02T08:00:00Z'));
    render(tegn({ m1: { pick: '1', chanceStake: 0 } }, { url: '/spil/sl?runde=1' }));
    expect(screen.getByText(/Runden er låst/)).toBeInTheDocument();
    expect(screen.queryByText(/Tip mindst én kamp i runden først/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chancen er brugt/)).not.toBeInTheDocument();
  });

  // 2) Saldoen er faldet under grænsen for at BRUGE Chancen — men den aktive
  //    chance forsvinder ikke af den grund.
  it('viser den gemte indsats, selv når saldoen er for lav til at sætte en ny', () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 } }, { me: { uid: 'me', totalPoints: 5 } }));
    expect(screen.getByText(/Du kan sætte en NY chance, når du har mindst/)).toBeInTheDocument();
    expect(screen.getByText(/På spil nu:/)).toHaveTextContent('4 point');
  });

  // 3) maxStake følger den LEVENDE saldo. Et point tabt fredag kan sænke
  //    loftet, mens der stadig ligger mere gemt på søndagskampen. Linjen skal
  //    læse den rå gemte værdi — klampede den, ville den lyve om præcis det
  //    tal, den findes for at vise.
  it('viser den RÅ gemte indsats, også når loftet er faldet under den', () => {
    // totalPoints 20 → maks = min(8, floor(0,15 × 20)) = 3. Gemt: 8.
    render(tegn({ m1: { pick: '1', chanceStake: 8 } }, { me: { uid: 'me', totalPoints: 20 } }));
    expect(screen.getByText(/På spil nu:/)).toHaveTextContent('8 point');
    expect(screen.getByText(/af maks 3/)).toBeInTheDocument();
  });

  it('skriver indsatsen på ⚡-pillen — som "indsats", ikke som "point"', () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 } }));
    const pille = screen.getByText(/⚡ Chancen/);
    expect(pille).toHaveTextContent('indsats 4');
    // "4 point" på kortet ville kollidere med pick-knappernes POINT lige
    // nedenunder — dér betyder tallet udbetaling ved rigtigt tip.
    expect(pille.textContent).not.toMatch(/point/i);
  });

  // Synkronisér kun OPAD. Faldt tælleren til 1, når man valgte en anden kamp,
  // kunne man ikke flytte sin chance uden samtidig at sætte den ned.
  it('sætter ikke indsatsen ned, når man vælger en anden kamp', () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 }, m2: { pick: 'X', chanceStake: 0 } }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm2' } });
    expect(screen.getByRole('button', { name: /Flyt Chancen hertil/ })).toBeInTheDocument();
    expect(screen.getByText(/Rammer du ikke:/)).toHaveTextContent('−4');
  });

  // SKRIVNINGEN, ikke kun skærmen. save(clampedStake) kunne skiftes til
  // save(CHANCE.MIN) med hele suiten grøn: setBet er mocket og blev aldrig
  // assertet. Det er det symptom, der KOSTER POINT — panelet skrev 1 ned oven
  // i en indsats på 4.
  it('gemmer den viste indsats — ikke MIN', async () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 } }));
    setBet.mockClear();
    // Tiden er frossen i denne fil, og waitFor hænger under fake timers —
    // act tømmer i stedet mikrotask-køen efter den mockede skrivning.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Opdatér Chancen/ })); });
    expect(setBet).toHaveBeenCalled();
    expect(setBet.mock.calls[0][0]).toMatchObject({ matchId: 'm1', chanceStake: 4 });
  });

  it('gemmer den værdi, man har skruet op til', async () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 } }));
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    setBet.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Opdatér Chancen/ })); });
    expect(setBet).toHaveBeenCalled();
    expect(setBet.mock.calls[0][0]).toMatchObject({ chanceStake: 5 });
  });

  // DEPEN SKAL VÆRE ET TAL. Med bet-OBJEKTET i deps ville en ugemt ændring
  // blive nulstillet, hver gang serveren rørte dokumentet — objektet er nyt
  // ved hvert snapshot, også når tallet er uændret. Begrundelsen stod i
  // kommentaren, men var ubevist.
  it('beholder en ugemt ændring, når et nyt snapshot lander med samme tal', () => {
    const { rerender } = render(tegn({ m1: { pick: '1', chanceStake: 4 } }));
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText(/Rammer du ikke:/)).toHaveTextContent('−5');
    // Nyt objekt, samme tal — præcis som et Firestore-snapshot.
    rerender(tegn({ m1: { pick: '1', chanceStake: 4 } }));
    expect(screen.getByText(/Rammer du ikke:/)).toHaveTextContent('−5');
  });

  // QC's fund: med chancen på en LÅST kamp pegede dropdownen på en anden,
  // åben kamp, og knappen sagde "Aktivér Chancen". Klikket nulstillede først
  // den låste (afvist af reglerne), men skrev derefter den nye — to bets med
  // chanceStake > 0 i samme runde, som serveren afregner hver for sig.
  it('tilbyder ikke at sætte en ny chance, når rundens chance er låst fast', () => {
    const LAAST = [
      { ...MED_ODDS[0], kickoff: new Date('2026-08-01T18:00:00Z') },
      MED_ODDS[1],
      ...MED_ODDS.slice(2),
    ];
    render(tegn(
      { m1: { pick: '1', chanceStake: 4 }, m2: { pick: 'X', chanceStake: 0 } },
      { matches: LAAST, url: '/spil/sl?runde=1' },
    ));
    expect(screen.getByText(/Chancen er brugt i denne runde/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chancen/ })).not.toBeInTheDocument();
    // "Fjern" var lige så død — to kald uden virkning og ingen fejlbesked.
    expect(screen.queryByRole('button', { name: 'Fjern' })).not.toBeInTheDocument();
    // Men tallet står der stadig: chancen er jo i spil.
    expect(screen.getByText(/På spil nu:/)).toHaveTextContent('4 point');
  });

  // Slår nulstillingen af den gamle kamp fejl, må den nye IKKE skrives.
  it('skriver ikke den nye chance, hvis den gamle ikke kunne nulstilles', async () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 }, m2: { pick: 'X', chanceStake: 0 } }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm2' } });
    setBet.mockClear();
    setBet.mockResolvedValueOnce({ ok: false, error: 'Tippet kunne ikke gemmes (deadline passeret eller ingen adgang).' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Flyt Chancen hertil/ })); });
    expect(screen.getByText(/deadline passeret/)).toBeInTheDocument();
    // Præcis ét kald: nulstillingen. Den nye chance blev ikke skrevet.
    expect(setBet).toHaveBeenCalledTimes(1);
    expect(setBet.mock.calls[0][0]).toMatchObject({ matchId: 'm1', chanceStake: 0 });
  });

  // Knappen skal sige, at chancen FLYTTES — intet sagde før, at et klik
  // fjerner den fra den anden kamp.
  it('siger at chancen flyttes, når man vælger en anden kamp', () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 }, m2: { pick: 'X', chanceStake: 0 } }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'm2' } });
    expect(screen.getByRole('button', { name: 'Flyt Chancen hertil' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aktivér Chancen' })).not.toBeInTheDocument();
  });

  // Loftet kan falde under det gemte. Så modsagde fladen sig selv: "På spil
  // nu: 8 point" over en tæller på 3, og et klik satte de 8 ned uden varsel.
  it('siger det, når en opdatering ville sætte indsatsen ned', () => {
    render(tegn({ m1: { pick: '1', chanceStake: 8 } }, { me: { uid: 'me', totalPoints: 20 } }));
    const advarsel = screen.getByText(/sættes indsatsen ned/);
    expect(advarsel).toHaveTextContent('fra 8 til 3');
    expect(advarsel).toHaveTextContent('maksimum er nu 3');
  });

  it('siger ikke noget om nedsættelse, når loftet rummer den gemte indsats', () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 } }));
    expect(screen.queryByText(/sættes indsatsen ned/)).not.toBeInTheDocument();
  });

  // "På spil nu: 4 point" efterfulgt af "du skal have mindst 7" er tvetydigt,
  // hvis der ikke står, at de 4 stadig gælder.
  it('siger at en aktiv chance afregnes, selv når man ikke kan sætte en ny', () => {
    render(tegn({ m1: { pick: '1', chanceStake: 4 } }, { me: { uid: 'me', totalPoints: 5 } }));
    expect(screen.getByText(/afregnes som normalt/)).toBeInTheDocument();
  });
});

// --- Chancens udfald på kampkortet ----------------------------------------
//
// DET STØRSTE HUL. ⚡-pillen lå i grenen EFTER m.result, så den forsvandt helt,
// så snart facit kom — på præcis den skærm, man står på lige efter runden.
// Rundens facit-kort trak de fire point fra uden at sige hvor.
describe('kampkortet — hvad chancen kostede', () => {
  const SPILLET = [
    { id: 'p1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: KICKOFF,
      odds: { 1: 3.9, X: 3.5, 2: 2 }, result: '1' },
    { id: 'p2', round: 1, home: 'Brøndby IF', away: 'FC Midtjylland', kickoff: KICKOFF,
      odds: { 1: 2.2, X: 3.4, 2: 3.1 }, result: 'X' },
  ];
  const tegn = (bets, matches = SPILLET) => {
    mockBets.mockReturnValue({ betsByMatch: bets, loading: false });
    return render(
      <MemoryRouter initialEntries={['/spil/sl?runde=1']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={(
              <FootballTip
                game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY }}
                me={{ uid: 'me', totalPoints: 100 }}
                matches={matches}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('viser tabet på kortet, når chancen er tabt', () => {
    tegn({ p1: { pick: '2', points: -4, chanceStake: 4 } });
    const maerke = screen.getByText(/⚡ −4/);
    expect(maerke).toHaveAttribute('title', 'Chancen tabt: 4 point');
    expect(maerke).toHaveClass('badge--red');
    // Og 1X2-mærket står stadig ved siden af: de to tal lægges sammen.
    expect(screen.getByText('Ikke ramt')).toBeInTheDocument();
  });

  it('viser gevinsten på kortet, når chancen er vundet', () => {
    tegn({ p1: { pick: '1', points: 15.9, chanceStake: 4 } });
    const maerke = screen.getByText(/⚡ \+12/);
    expect(maerke).toBeInTheDocument();
    // Farven og teksten skal følge fortegnet: et tab må ikke kunne blive grønt.
    expect(maerke).toHaveClass('badge--green');
    expect(maerke).toHaveAttribute('title', 'Chancen vundet: 12 point oveni');
    // "Ramt +3,9" er 1X2 ALENE og skal blive stående — erstattede vi det med
    // summen, ville kortet vise ét tal og Mine tips et andet for samme kamp.
    expect(screen.getByText(/Ramt \+3,9/)).toBeInTheDocument();
  });

  it('siger hvorfor, når kampen mangler odds — og gætter ikke et tal', () => {
    const udenOdds = [{ ...SPILLET[0], odds: null }, SPILLET[1]];
    tegn({ p1: { pick: '2', points: 0, chanceStake: 4 } }, udenOdds);
    expect(screen.getByText(/⚡ ingen odds/)).toHaveTextContent('hverken vundet eller tabt');
    expect(screen.queryByText(/⚡ −4/)).not.toBeInTheDocument();
  });

  // Facit står på kampen, før triggeren har scoret bettet. Uden en egen
  // tilstand viste kortet dér det modsatte af sandheden.
  it('siger "afregnes om lidt", mens bettet venter på serveren', () => {
    tegn({ p1: { pick: '2', chanceStake: 4 } }); // intet points-felt
    expect(screen.getByText(/⚡ afregnes om lidt/)).toBeInTheDocument();
    expect(screen.queryByText(/⚡ [−+]/)).not.toBeInTheDocument();
  });

  it('sætter ikke et chance-mærke på en kamp uden chance', () => {
    tegn({ p1: { pick: '1', points: 3.9, chanceStake: 0 } });
    // Panelets overskrift hedder "Chancen ⚡", så der SKAL søges på mærket —
    // ikke på tegnet alene.
    expect(screen.queryByText(/⚡ [−+]/)).not.toBeInTheDocument();
    expect(screen.queryByText(/⚡ ikke afregnet/)).not.toBeInTheDocument();
  });
});

// ⚡ ER CHANCEN OVERALT I APPEN — PointOpdeling siger det eksplicit, og
// TipsHistorik bruger 🔗 til combi af netop den grund. Facit-kortet og
// delingsteksten skrev stadig "combi +N ⚡", så samme tegn stod for to ting på
// samme skærm.
describe('combi-mærket', () => {
  it('bruger 🔗 til combi, ikke ⚡', () => {
    const alle = [
      { id: 'k1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: KICKOFF, odds: { 1: 2, X: 3, 2: 4 }, result: '1' },
      { id: 'k2', round: 1, home: 'Brøndby IF', away: 'FC Midtjylland', kickoff: KICKOFF, odds: { 1: 2, X: 3, 2: 4 }, result: '1' },
    ];
    mockBets.mockReturnValue({
      betsByMatch: { k1: { pick: '1', points: 2 }, k2: { pick: '1', points: 2 } }, loading: false,
    });
    render(
      <MemoryRouter initialEntries={['/spil/sl?runde=1']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={(
              <FootballTip
                game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY }}
                me={{ uid: 'me', totalPoints: 100 }}
                matches={alle}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );
    const combi = screen.getByText(/combi \+/);
    expect(combi).toHaveTextContent('🔗');
    expect(combi.textContent).not.toMatch(/⚡/);
  });

  it('deler combi med 🔗, ikke ⚡', async () => {
    const alle = [
      { id: 'k1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: KICKOFF, odds: { 1: 2, X: 3, 2: 4 }, result: '1' },
      { id: 'k2', round: 1, home: 'Brøndby IF', away: 'FC Midtjylland', kickoff: KICKOFF, odds: { 1: 2, X: 3, 2: 4 }, result: '1' },
    ];
    mockBets.mockReturnValue({
      betsByMatch: { k1: { pick: '1', points: 2 }, k2: { pick: '1', points: 2 } }, loading: false,
    });
    render(
      <MemoryRouter initialEntries={['/spil/sl?runde=1']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={(
              <FootballTip
                game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY }}
                me={{ uid: 'me', totalPoints: 100 }}
                matches={alle}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Del i chatten/ })); });
    const tekst = mockShare.mock.calls[0][0];
    expect(tekst).toMatch(/combi \+.*🔗/);
    expect(tekst).not.toMatch(/⚡/);
  });
});

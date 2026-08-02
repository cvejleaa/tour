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
vi.mock('./LeagueBets', () => ({ default: () => <div data-testid="liga-tips" /> }));
vi.mock('../../../components/ClubBadge', () => ({ default: () => <span /> }));

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
    setup({ teams: [], eloHistory: undefined });
    expect(screen.getByText('AGF')).toBeInTheDocument();
    expect(screen.getByText('FC Midtjylland')).toBeInTheDocument();
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

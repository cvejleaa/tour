// ---------------------------------------------------------------------------
// HVER FLADE SKAL SENDE KLUBFARVERNE MED — listen står her.
//
// Samme slags fil som `visningsnavnFlader.test.jsx`, og af samme grund: et felt
// blev lagt på ét sted, mens hver enkelt flade selv skulle huske at LÆSE det.
// Dengang blev `vis` sat på i `teamsOf`, mens pulje-tippet og spilprofilen blev
// ved med at skrive `t.name` — kampkortet sagde "Brighton", knappen ved siden
// af sagde "Brighton and Hove Albion", og ingen test så det.
//
// Ringen har præcis samme form: `useKlubFarver` findes ét sted, og tre flader
// skal kalde den. Glemmer én af dem det, står spilleren med en ring på sin
// profil og ingen i stillingen — og hjælpeteksten, der lover begge dele, er
// falsk igen.
//
// TESTEN BRUGER DEN ÆGTE Avatar, ikke en attrap. En attrap ville kun bevise, at
// en prop blev sendt; her måles der på, at ringen faktisk bliver TEGNET.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_r, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' }, profile: { displayName: 'Bo Bibamus' } }),
}));
vi.mock('./gameActions', () => ({ setPlayerFavoriteTeam: vi.fn() }));

const mockStandings = vi.fn();
vi.mock('./useVisibleGameStandings', () => ({ useVisibleGameStandings: () => mockStandings() }));
vi.mock('./useGameStandings', () => ({ useGameStandings: () => ({ standings: RAEKKER }) }));
vi.mock('./useGameLeagues', () => ({ useGameLeagues: () => ({ leagues: LIGAER, loading: false, error: null }) }));
vi.mock('./useLeagueMessages', () => ({ useLeagueMessages: () => ({ messages: [], loading: false }) }));
vi.mock('./useLeagueQuestions', () => ({ useLeagueQuestions: () => ({ questions: [], answers: {} }) }));
vi.mock('./LeagueQuestions', () => ({ default: () => null }));
vi.mock('./football/SpillerDetalje', () => ({ default: () => null }));

const { default: GameStandings } = await import('./GameStandings');
const { default: GameLeagues } = await import('./GameLeagues');
const { default: GameProfile } = await import('./GameProfile');

// BRØNDBY-GUL er valgt, fordi den er umulig at forveksle med `avatarColor`s
// palet og med hårlinjerne. En farve tæt på en af dem ville gøre testen blind.
const GUL = '#E5B905';
const HOLD = [
  { name: 'Brøndby IF', short: 'BIF', color: GUL },
  { name: 'Viborg FF', short: 'VFF', color: '#026B41' },
];
const SPIL = { id: 'sl', type: 'football', name: 'Superligaen', teams: HOLD };

const RAEKKER = [
  { uid: 'me', name: 'Bo', totalPoints: 60, rank: 1, favoriteTeam: 'Brøndby IF' },
  { uid: 'u2', name: 'Ida', totalPoints: 50, rank: 2, favoriteTeam: null },
  { uid: 'u3', name: 'Kaj', totalPoints: 40, rank: 3, favoriteTeam: 'Viborg FF' },
  { uid: 'u4', name: 'Lis', totalPoints: 30, rank: 4, favoriteTeam: 'Brøndby IF' },
];
const LIGAER = [{ id: 'l1', name: 'Vennerne', memberUids: ['me', 'u2', 'u3', 'u4'], ownerUid: 'me' }];

/** Box-shadows i et udsnit af fladen — dét er ringene. */
function ringe(rod) {
  if (!rod) return '';
  return [...rod.querySelectorAll('span[style]')]
    .map((e) => e.style.boxShadow)
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
}

// STILLINGEN HAR TO STEDER MED AVATARER: podiet øverst og tabellen under.
// Testen SKAL måle dem hver for sig. Første udgave scannede hele fladen, og så
// overlevede en mutation, der fjernede ringen fra TABELLENS rækker med alle 38
// tests grønne — podiets ring alene opfyldte assertionen. Præcis den fælde,
// CLAUDE.md kalder "en test, der kun tjekker at noget blev VIST".
const podiet = (c) => c.querySelector('.podium');
const tabellen = (c) => c.querySelector('table');
// Brøndby-gul. Jsdom normaliserer nogle box-shadows til rgb() og lader andre
// stå som hex, alt efter hvordan stilen er sat — begge former skal tælle, ellers
// måler testen jsdoms formatering frem for koden.
const erGul = (s) => s.includes('rgb(229, 185, 5)') || s.includes('#e5b905');

describe('klubringen når ud på hver flade', () => {
  it('stillingen', () => {
    mockStandings.mockReturnValue({
      standings: RAEKKER, leagues: LIGAER, leagueCount: 1, loading: false, error: null,
    });
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route path="/spil/:gameId" element={<GameStandings gameId="sl" game={SPIL} />} />
        </Routes>
      </MemoryRouter>,
    );
    // BEGGE steder, hver for sig — se kommentaren ved `podiet`/`tabellen`.
    expect(podiet(container)).not.toBeNull();
    expect(erGul(ringe(podiet(container)))).toBe(true);
    expect(tabellen(container)).not.toBeNull();
    expect(erGul(ringe(tabellen(container)))).toBe(true);
  });

  it('ligaerne', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl?liga=l1']}>
        <Routes>
          <Route path="/spil/:gameId" element={<GameLeagues gameId="sl" game={SPIL} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(erGul(ringe(container))).toBe(true);
  });

  it('spilprofilen', () => {
    const { container } = render(
      <GameProfile game={SPIL} me={{ favoriteTeam: 'Brøndby IF' }} />,
    );
    expect(erGul(ringe(container))).toBe(true);
  });

  // MODPRØVEN PÅ SPILLET. Uden gaten i `useKlubFarver` ville `teamsOf` falde
  // tilbage på Superligaens tolv hold, og en Tour-spiller ville få en ring,
  // fordi hans cykelhold tilfældigvis delte navn med en dansk klub.
  it('IKKE på et spil uden fodboldhold', () => {
    mockStandings.mockReturnValue({
      standings: RAEKKER, leagues: LIGAER, leagueCount: 1, loading: false, error: null,
    });
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/t']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={<GameStandings gameId="t" game={{ id: 't', type: 'tour', teams: [] }} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(erGul(ringe(container))).toBe(false);
  });

  // …og en spiller UDEN valgt hold får ingen ring. Uden den her ville en
  // implementering, der altid tegnede noget, bestå alle testene ovenfor.
  it('IKKE om en spiller uden yndlingshold', () => {
    mockStandings.mockReturnValue({
      standings: [RAEKKER[1]], leagues: LIGAER, leagueCount: 1, loading: false, error: null,
    });
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route path="/spil/:gameId" element={<GameStandings gameId="sl" game={SPIL} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(ringe(container)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// HJÆLPETEKSTEN SKAL PASSE PÅ DET, KODEN GØR.
//
// Den lovede "holdets farve i stillingen og i dine ligaer", mens yndlingsholdet
// ikke gjorde noget som helst uden for sit eget kort. En tekst, der beskriver en
// funktion, der ikke findes, er værre end ingen tekst — se CLAUDE.md om
// hjælpetekster, der modsiger sig selv.
// ---------------------------------------------------------------------------
describe('spilprofilens hjælpetekst', () => {
  it('siger RING og ikke bare "farve", for fyldet er stadig det personlige', () => {
    const { container } = render(<GameProfile game={SPIL} me={{}} />);
    const t = container.textContent;
    expect(t).toMatch(/ring om sig/i);
    expect(t).toMatch(/stillingen/);
    expect(t).toMatch(/ligaer/);
    // …og den må IKKE love, at holdet farver avataren uden videre. Det var
    // netop den formulering, der var falsk.
    expect(t).not.toMatch(/Det giver din\s+avatar holdets farve/);
  });

  // DE TO TEKSTER SKAL VÆRE ENS. Guiden og spilprofilen beskriver den samme
  // funktion, og stod der forskelligt, ville den ene være forkert. Begge sagde
  // "holdets farve", mens yndlingsholdet slet ikke rørte avataren; da
  // spilprofilen blev rettet, blev guiden stående og sagde så noget andet.
  it('står ordret det samme i Guiden', () => {
    const her = dirname(fileURLToPath(import.meta.url));
    const kilde = (f) => readFileSync(resolve(her, f), 'utf8').replace(/\s+/g, ' ');
    const SAETNING = 'avatar får holdets farve som ring om sig i stillingen og i dine ligaer';
    expect(kilde('./GameProfile.jsx')).toContain(SAETNING);
    expect(kilde('./football/FootballHelp.jsx')).toContain(SAETNING);
  });
});

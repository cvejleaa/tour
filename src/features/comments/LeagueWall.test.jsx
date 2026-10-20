import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// Firebase + actions mockes, så vi kan teste rækkefølgen isoleret.
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), onSnapshot: vi.fn(), query: vi.fn(),
  where: vi.fn(), orderBy: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
}));
vi.mock('./commentActions', () => ({ postLeagueComment: vi.fn(), deleteLeagueComment: vi.fn() }));
vi.mock('../leagues/activityActions', () => ({ tryLogActivity: vi.fn(), ACTIVITY: { COMMENT: 'comment' } }));
vi.mock('./useLeagueComments', () => ({ useLeagueComments: vi.fn() }));

import LeagueWall from './LeagueWall';
import { useLeagueComments } from './useLeagueComments';

beforeEach(() => {
  // Hook'en leverer beskeder ældste-først (som Firestore-forespørgslen).
  useLeagueComments.mockReturnValue({
    comments: [
      { id: 'a', uid: 'u1', displayName: 'Ældste', text: 'Første besked', createdAt: 1 },
      { id: 'b', uid: 'u2', displayName: 'Nyeste', text: 'Sidste besked', createdAt: 2 },
    ],
    loading: false,
    error: null,
  });
});

// Reglerne kræver nu strenge og serverens ur på nye beskeder — men ældre
// beskeder kan bære et map i navn/tekst/tidsstempel og en ikke-liste i
// reactions (ethvert medlem må skrive feltet). Et map som React-child, i
// new Date() eller i .filter kaster, og hele væggen er væk (Security-fund).
describe('LeagueWall – fjendtligt indhold i ældre beskeder', () => {
  it('map som navn/tekst/tidsstempel og en ikke-liste i reactions hvidner ikke væggen', () => {
    useLeagueComments.mockReturnValue({
      comments: [
        {
          id: 'g', uid: 'u3', displayName: { a: 1 }, text: { b: 2 }, createdAt: Object.create(null),
          reactions: { '👍': 'ikke en liste', '❤️': { d: 4 }, '🔥': ['u1'] },
        },
        { id: 'a', uid: 'u1', displayName: 'Ældste', text: 'Første besked', createdAt: 1 },
      ],
      loading: false,
      error: null,
    });
    expect(() => render(<LeagueWall leagueId="L1" meUid="u1" myName="Mig" />)).not.toThrow();
    expect(screen.getAllByTestId('league-comment')).toHaveLength(2);
    expect(screen.getByText('Første besked')).toBeInTheDocument();
    expect(screen.getByText('Spiller')).toBeInTheDocument();
  });
});

describe('LeagueWall – rækkefølge', () => {
  it('viser nyeste besked øverst', () => {
    render(<LeagueWall leagueId="L1" meUid="u1" myName="Mig" />);
    const items = screen.getAllByTestId('league-comment');
    expect(items).toHaveLength(2);
    // Øverste element skal være den nyeste besked.
    expect(items[0]).toHaveTextContent('Sidste besked');
    expect(items[1]).toHaveTextContent('Første besked');
  });
});

// Navn, emoji og hold caches på beskeden og renderes råt. Reglerne kræver nu strenge ved create — men et
// ældre dokument kan bære et map, og ét map hvidnede hele væggen for alle ligaens medlemmer. Vagten i
// LeagueWall.jsx havde INGEN test: den kunne fjernes, og suiten forblev grøn (Test Manager).
describe('LeagueWall – ældre dokumenter med forgiftet navn, emoji eller hold', () => {
  const giftig = (over) => ({ id: 'g', uid: 'u9', displayName: 'Ok', text: 'Gift', createdAt: 1, ...over });

  it.each([
    ['displayName', { displayName: { a: 1 } }],
    ['avatarEmoji', { avatarEmoji: { b: 2 } }],
    // {c:3} ville IKKE kaste i teamMeta (nøglen bliver bare "[object Object]") — men {toString:null} kaster
    // ved enhver implicit streng-konvertering, og det er den gift-form, der kan gemmes uden om fladen.
    ['favoriteTeam', { favoriteTeam: { toString: null } }],
  ])('et map som %s hvidner ikke væggen — teksten vises stadig', (_felt, over) => {
    useLeagueComments.mockReturnValue({ comments: [giftig(over)], loading: false, error: null });
    expect(() => render(<LeagueWall leagueId="L1" meUid="u1" myName="Mig" />)).not.toThrow();
    expect(screen.getByText('Gift')).toBeInTheDocument();
  });

  it('et forgiftet navn falder tilbage til "Spiller" — et tomt navn gør det samme', () => {
    useLeagueComments.mockReturnValue({
      comments: [
        giftig({ id: 'a', displayName: { a: 1 }, text: 'Map' }),
        giftig({ id: 'b', displayName: '', text: 'Tom' }),
      ],
      loading: false, error: null,
    });
    render(<LeagueWall leagueId="L1" meUid="u1" myName="Mig" />);
    const [a, b] = ['Map', 'Tom'].map((t) => screen.getByText(t).closest('li'));
    expect(within(a).getByText('Spiller')).toBeInTheDocument();
    expect(within(b).getByText('Spiller')).toBeInTheDocument();
  });
});

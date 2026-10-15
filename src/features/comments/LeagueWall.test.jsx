import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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

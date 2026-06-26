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

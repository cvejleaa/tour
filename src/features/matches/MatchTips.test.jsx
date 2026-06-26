import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock datakilden (tips for kampen)
const mockBets = vi.fn();
vi.mock('./useMatchBets', () => ({ useMatchBets: (...a) => mockBets(...a) }));
// Stub tunge børn
vi.mock('../../components/Avatar', () => ({ default: () => <span data-testid="avatar" /> }));
vi.mock('../reactions/Reactions', () => ({ default: () => <span data-testid="reactions" /> }));

import MatchTips from './MatchTips';

const match = { id: 'm1', round: 'group' };
const usersByUid = {
  me: { displayName: 'Mig' },
  liga: { displayName: 'Ligakammerat' },
  fremmed: { displayName: 'Fremmed' },
};

const bets = [
  { id: 'b1', uid: 'me', home: 1, away: 0 },
  { id: 'b2', uid: 'liga', home: 2, away: 2 },
  { id: 'b3', uid: 'fremmed', home: 0, away: 3 },
];

describe('MatchTips — liga-filtrering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBets.mockReturnValue({ bets, loading: false });
  });

  it('viser kun ens egne + liga-fællers tips når visibleUids er givet', () => {
    render(<MatchTips match={match} meUid="me" usersByUid={usersByUid} visibleUids={new Set(['me', 'liga'])} />);
    fireEvent.click(screen.getByTestId('reveal-tips-btn'));
    expect(screen.getByText('Mig')).toBeInTheDocument();
    expect(screen.getByText('Ligakammerat')).toBeInTheDocument();
    expect(screen.queryByText('Fremmed')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('match-tip-row')).toHaveLength(2);
  });

  it('viser alle når ingen visibleUids er givet (fald-tilbage)', () => {
    render(<MatchTips match={match} meUid="me" usersByUid={usersByUid} />);
    fireEvent.click(screen.getByTestId('reveal-tips-btn'));
    expect(screen.getAllByTestId('match-tip-row')).toHaveLength(3);
  });
});

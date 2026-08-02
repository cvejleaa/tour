// Tests for StageAnswers – facit + alles tips + etapens top (liga-afgrænset).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {}, auth: {} }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' }, isGlobalAdmin: false }),
}));
vi.mock('./useStageBets', () => ({
  useStageBets: () => ({
    bets: [
      { id: 'me_s', uid: 'me', winnerTeam: 'A', gcTeam: 'B', sprintTeam: 'C' },
      { id: 'u2_s', uid: 'u2', winnerTeam: 'B', gcTeam: 'B', sprintTeam: 'X' },
      { id: 'x_s', uid: 'stranger', winnerTeam: 'A', gcTeam: 'A', sprintTeam: 'C' },
    ],
    loading: false,
  }),
}));
vi.mock('../leaderboard/useStandings', () => ({
  useStandings: () => ({ standings: [
    { uid: 'me', displayName: 'Mig' },
    { uid: 'u2', displayName: 'To' },
    { uid: 'stranger', displayName: 'Fremmed' },
  ] }),
}));
vi.mock('../leagues/useLeagues', () => ({
  useLeagues: () => ({ leagues: [{ memberUids: ['me', 'u2'] }] }),
}));

import StageAnswers from './StageAnswers';

const stage = {
  id: '2026-stage-5', type: 'flat',
  result: {
    winnerTeam: 'A', gcTeam: 'B', sprintTeam: 'C',
    podium: { winnerTeam: ['A', 'B', 'C'], gcTeam: ['B', 'A'], sprintTeam: ['C'] },
  },
};

describe('StageAnswers', () => {
  it('viser facit, etapens top og alle tips-sektioner', () => {
    render(<StageAnswers stage={stage} />);
    expect(screen.getByTestId('stage-facit')).toBeInTheDocument();
    expect(screen.getByTestId('stage-top')).toBeInTheDocument();
    expect(screen.getByTestId('stage-all-answers')).toBeInTheDocument();
  });

  it('afgrænser til liga: kun mig + ligakammerater, ikke fremmede', () => {
    render(<StageAnswers stage={stage} />);
    expect(screen.getAllByTestId('stage-answer-row')).toHaveLength(2);
    expect(screen.getAllByText('Mig').length).toBeGreaterThan(0);
    expect(screen.getAllByText('To').length).toBeGreaterThan(0);
    expect(screen.queryByText('Fremmed')).toBeNull();
  });

  it('markerer "dig" på egen række', () => {
    render(<StageAnswers stage={stage} />);
    expect(screen.getAllByText('dig').length).toBeGreaterThan(0);
  });
});

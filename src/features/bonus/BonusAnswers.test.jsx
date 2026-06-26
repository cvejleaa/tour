// Tests for BonusAnswers – afsløring af alles bonus-svar.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), onSnapshot: vi.fn(), query: vi.fn(), where: vi.fn(),
}));

// Styr hvilke svar hooket returnerer
const mockUseBonusBets = vi.fn();
vi.mock('./useBonusData', () => ({ useBonusBets: (...a) => mockUseBonusBets(...a) }));

import BonusAnswers from './BonusAnswers';

const question = { id: 'q1', type: 'groupWinner' };
const users = {
  a: { uid: 'a', displayName: 'Anna' },
  b: { uid: 'b', displayName: 'Bo' },
  c: { uid: 'c', displayName: 'Cecilie' },
};

describe('BonusAnswers', () => {
  it('er foldet sammen som standard og henter ikke før den åbnes', () => {
    mockUseBonusBets.mockReturnValue({ bets: [], loading: false });
    render(<BonusAnswers question={question} meUid="a" usersByUid={users} />);
    expect(screen.getByTestId('reveal-bonus-answers-btn')).toHaveTextContent('Se alles svar');
    // hook kaldt med enabled=false når lukket
    expect(mockUseBonusBets).toHaveBeenCalledWith('q1', false);
  });

  it('viser alles svar ved åbning (admin ser alle på tværs af ligaer)', () => {
    mockUseBonusBets.mockReturnValue({
      bets: [
        { id: 'a_q1', uid: 'a', answer: 'GER', points: 5 },
        { id: 'b_q1', uid: 'b', answer: 'FRA', points: 0 },
        { id: 'c_q1', uid: 'c', answer: 'BRA' },
      ],
      loading: false,
    });
    render(<BonusAnswers question={question} meUid="a" usersByUid={users} visibleUids={new Set(['a'])} isAdmin />);
    fireEvent.click(screen.getByTestId('reveal-bonus-answers-btn'));
    // Admin ser alle tre, selvom kun 'a' er i visibleUids
    expect(screen.getAllByTestId('bonus-answer-row')).toHaveLength(3);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
  });

  it('ikke-admin ser kun ligakammerater (+ sig selv)', () => {
    mockUseBonusBets.mockReturnValue({
      bets: [
        { id: 'a_q1', uid: 'a', answer: 'GER' },
        { id: 'b_q1', uid: 'b', answer: 'FRA' },
        { id: 'c_q1', uid: 'c', answer: 'BRA' },
      ],
      loading: false,
    });
    render(<BonusAnswers question={question} meUid="a" usersByUid={users} visibleUids={new Set(['a', 'b'])} />);
    fireEvent.click(screen.getByTestId('reveal-bonus-answers-btn'));
    expect(screen.getAllByTestId('bonus-answer-row')).toHaveLength(2); // a + b, ikke c
    expect(screen.queryByText('Cecilie')).not.toBeInTheDocument();
  });
});

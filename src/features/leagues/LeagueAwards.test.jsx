// Tests for LeagueAwards — manuelle liga-point på fælles bonusspørgsmål.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  doc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
  onSnapshot: vi.fn(() => () => {}),
}));

const QUESTIONS = [
  { id: 'q1', label: 'Hvem vinder bjergtrøjen?', type: 'team', deadline: null, points: 3 },
];
vi.mock('../admin/useBonusQuestions', () => ({
  useBonusQuestions: () => ({ questions: QUESTIONS, loading: false, error: '' }),
}));

vi.mock('./leagueAwardActions', () => ({ saveLeagueBonusAwards: vi.fn(async () => ({ saved: 1 })) }));

import LeagueAwards from './LeagueAwards';
import { saveLeagueBonusAwards } from './leagueAwardActions';

const MEMBERS = [
  { uid: 'u1', displayName: 'Anna' },
  { uid: 'u2', displayName: 'Bo' },
];

beforeEach(() => vi.clearAllMocks());

describe('LeagueAwards', () => {
  it('viser eksisterende tildelinger for alle medlemmer (læse-visning)', () => {
    render(<LeagueAwards
      leagueId="liga1" meUid="u1" isManager={false} members={MEMBERS}
      awards={[{ id: 'liga1_q1', questionId: 'q1', label: 'Hvem vinder bjergtrøjen?', awards: { u1: 5, u2: -2 } }]}
    />);
    expect(screen.getByTestId('league-awards')).toBeInTheDocument();
    expect(screen.getByText('Anna: +5')).toBeInTheDocument();
    expect(screen.getByText('Bo: -2')).toBeInTheDocument();
    // Ikke-manager har ingen redigering
    expect(screen.queryByTestId('award-question')).toBeNull();
  });

  it('ikke-manager uden tildelinger ser tom-tekst', () => {
    render(<LeagueAwards leagueId="liga1" meUid="u1" isManager={false} members={MEMBERS} awards={[]} />);
    expect(screen.getByText(/Ingen individuelle point tildelt endnu/)).toBeInTheDocument();
  });

  it('manager kan vælge spørgsmål, indtaste point og gemme', async () => {
    render(<LeagueAwards leagueId="liga1" meUid="admin" isManager members={MEMBERS} awards={[]} />);
    fireEvent.change(screen.getByTestId('award-question'), { target: { value: 'q1' } });
    fireEvent.change(await screen.findByTestId('award-input-u1'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('award-save'));
    await waitFor(() => expect(saveLeagueBonusAwards).toHaveBeenCalledWith(expect.objectContaining({
      leagueId: 'liga1', questionId: 'q1', label: 'Hvem vinder bjergtrøjen?',
      awards: expect.objectContaining({ u1: '4' }), updatedBy: 'admin',
    })));
  });

  it('forudfylder felterne fra en eksisterende tildeling', async () => {
    render(<LeagueAwards
      leagueId="liga1" meUid="admin" isManager members={MEMBERS}
      awards={[{ id: 'liga1_q1', questionId: 'q1', label: 'x', awards: { u2: 7 } }]}
    />);
    fireEvent.change(screen.getByTestId('award-question'), { target: { value: 'q1' } });
    await waitFor(() => expect(screen.getByTestId('award-input-u2').value).toBe('7'));
  });
});

// Tests for StageCard's to genvejs-handlinger:
//   1) "Kopiér fra forrige etape" — udfylder + gemmer; deaktiveret uden tidligere tip.
//   2) "Anvend på alle åbne etaper" — kalder callback efter bekræftelse.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));

const mockSetDoc = vi.fn(() => Promise.resolve());
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ _ref: true })),
  setDoc: (...a) => mockSetDoc(...a),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

import StageCard from './StageCard';

// Åben etape (kickoff langt ude i fremtiden).
function openStage(overrides = {}) {
  return {
    id: '2026-stage-5', season: 2026, number: 5, type: 'flat',
    kickoff: '2099-07-05T12:00:00+02:00', ...overrides,
  };
}

const PREV = { winnerTeam: 'UAD', gcTeam: 'TVL', mountainTeam: 'EFE', sprintTeam: 'SOQ' };

describe('StageCard — Kopiér fra forrige etape', () => {
  beforeEach(() => vi.clearAllMocks());

  it('er skjult når der ikke er en tidligere tippet etape (fx etape 1)', () => {
    render(<StageCard stage={openStage()} uid="u1" bet={null} teams={['UAD', 'TVL', 'EFE', 'SOQ']} previousPicks={null} />);
    expect(screen.queryByTestId('copy-previous')).toBeNull();
  });

  it('udfylder de fire felter og gemmer ved klik', async () => {
    render(<StageCard stage={openStage()} uid="u1" bet={null} teams={['UAD', 'TVL', 'EFE', 'SOQ']} previousPicks={PREV} />);
    const btn = screen.getByTestId('copy-previous');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    // Felterne afspejler de kopierede værdier.
    expect(screen.getByTestId('pick-winnerTeam')).toHaveValue('UAD');
    expect(screen.getByTestId('pick-gcTeam')).toHaveValue('TVL');
    expect(screen.getByTestId('pick-mountainTeam')).toHaveValue('EFE');
    expect(screen.getByTestId('pick-sprintTeam')).toHaveValue('SOQ');

    // Og bettet er gemt via setDoc med de kopierede holdvalg.
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    const payload = mockSetDoc.mock.calls[0][1];
    expect(payload).toMatchObject({ uid: 'u1', stageId: '2026-stage-5', ...PREV });
  });
});

describe('StageCard — Anvend på alle åbne etaper', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('kalder callback med de aktuelle holdvalg efter bekræftelse', async () => {
    const onApply = vi.fn(() => Promise.resolve(3));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <StageCard
        stage={openStage()} uid="u1"
        bet={{ winnerTeam: 'UAD', gcTeam: 'TVL', mountainTeam: 'EFE', sprintTeam: 'SOQ' }}
        teams={['UAD', 'TVL', 'EFE', 'SOQ']}
        onApplyToOpenStages={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId('apply-all-open'));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(PREV));
    await waitFor(() => expect(screen.getByTestId('apply-msg')).toHaveTextContent('3'));
  });

  it('kalder IKKE callback når bekræftelse afvises', () => {
    const onApply = vi.fn(() => Promise.resolve(3));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <StageCard
        stage={openStage()} uid="u1"
        bet={{ winnerTeam: 'UAD' }}
        teams={['UAD', 'TVL', 'EFE', 'SOQ']}
        onApplyToOpenStages={onApply}
      />,
    );
    fireEvent.click(screen.getByTestId('apply-all-open'));
    expect(window.confirm).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('viser hverken knapper når etapen er låst', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <StageCard
        stage={openStage({ kickoff: '2020-07-05T12:00:00+02:00' })}
        uid="u1" bet={null} teams={['UAD']}
        previousPicks={PREV}
        onApplyToOpenStages={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('copy-previous')).toBeNull();
    expect(screen.queryByTestId('apply-all-open')).toBeNull();
  });
});

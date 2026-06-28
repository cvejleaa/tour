// Tests for StageCard's to genvejs-handlinger:
//   1) "Kopiér fra forrige etape" — udfylder + gemmer; deaktiveret uden tidligere tip.
//   2) "Anvend på alle åbne etaper" — kalder callback efter bekræftelse.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// StageCard indeholder et <Link> (📖 Læs om etapen), så alle renders skal
// ske inde i en router.
function render(ui) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
}

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

  it('viser tip-fristen (dato + kl. i dansk tid) på en åben etape', () => {
    render(<StageCard stage={openStage()} uid="u1" bet={null} teams={['UAD']} />);
    const dl = screen.getByTestId('stage-deadline');
    expect(dl.textContent).toMatch(/Tip lukker/);
    // kickoff 12:00 +02:00 → 12.00 i Europe/Copenhagen
    expect(dl.textContent).toMatch(/12\.00/);
  });

  it('udfylder de fire felter og gemmer ved klik', async () => {
    // Bjergetape så alle fire spørgsmål (inkl. bjerg) faktisk vises.
    render(<StageCard stage={openStage({ type: 'mountain' })} uid="u1" bet={null} teams={['UAD', 'TVL', 'EFE', 'SOQ']} previousPicks={PREV} />);
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

describe('StageCard — Hent tip fra lignende etape', () => {
  beforeEach(() => vi.clearAllMocks());

  const SIMILAR = [
    { id: '2026-stage-9', number: 9, startCity: 'X', finishCity: 'Y',
      picks: { winnerTeam: 'EFE', gcTeam: 'TVL', mountainTeam: 'UAD', sprintTeam: 'SOQ' } },
  ];

  it('er skjult når der ikke er nogen lignende tippet etape', () => {
    render(<StageCard stage={openStage({ type: 'mountain' })} uid="u1" bet={null} teams={['UAD', 'TVL', 'EFE', 'SOQ']} similarStages={[]} />);
    expect(screen.queryByTestId('copy-similar')).toBeNull();
  });

  it('kopierer holdvalg fra den valgte lignende etape og gemmer', async () => {
    render(<StageCard stage={openStage({ type: 'mountain' })} uid="u1" bet={null} teams={['UAD', 'TVL', 'EFE', 'SOQ']} similarStages={SIMILAR} />);
    const select = screen.getByTestId('copy-similar');
    fireEvent.change(select, { target: { value: '2026-stage-9' } });

    expect(screen.getByTestId('pick-winnerTeam')).toHaveValue('EFE');
    expect(screen.getByTestId('pick-gcTeam')).toHaveValue('TVL');
    expect(screen.getByTestId('pick-mountainTeam')).toHaveValue('UAD');
    expect(screen.getByTestId('pick-sprintTeam')).toHaveValue('SOQ');

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    const payload = mockSetDoc.mock.calls[0][1];
    expect(payload).toMatchObject({
      uid: 'u1', stageId: '2026-stage-5',
      winnerTeam: 'EFE', gcTeam: 'TVL', mountainTeam: 'UAD', sprintTeam: 'SOQ',
    });
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

describe('StageCard — Læs om etapen-link', () => {
  beforeEach(() => vi.clearAllMocks());

  it('viser et link til /etape/{number}', () => {
    render(<StageCard stage={openStage({ number: 7 })} uid="u1" bet={null} teams={['UAD']} />);
    const link = screen.getByTestId('read-about-stage');
    expect(link).toHaveTextContent(/Læs om etapen/);
    expect(link).toHaveAttribute('href', '/etape/7');
  });
});

describe('StageCard — betingede spørgsmål pr. etape', () => {
  beforeEach(() => vi.clearAllMocks());

  it('en flad etape skjuler bjergpoint-spørgsmålet', () => {
    render(<StageCard stage={openStage({ type: 'flat' })} uid="u1" bet={null} teams={['UAD']} />);
    expect(screen.getByTestId('pick-winnerTeam')).toBeTruthy();
    expect(screen.getByTestId('pick-gcTeam')).toBeTruthy();
    expect(screen.getByTestId('pick-sprintTeam')).toBeTruthy();
    expect(screen.queryByTestId('pick-mountainTeam')).toBeNull();
  });

  it('en holdtidskørsel (ttt) viser kun vinder-hold', () => {
    render(<StageCard stage={openStage({ number: 1, type: 'ttt' })} uid="u1" bet={null} teams={['UAD']} />);
    expect(screen.getByTestId('pick-winnerTeam')).toBeTruthy();
    expect(screen.queryByTestId('pick-gcTeam')).toBeNull();
    expect(screen.queryByTestId('pick-mountainTeam')).toBeNull();
    expect(screen.queryByTestId('pick-sprintTeam')).toBeNull();
  });

  it('et override i stage.questions vinder over typen', () => {
    const stage = openStage({
      type: 'flat',
      questions: { winnerTeam: true, gcTeam: false, mountainTeam: true, sprintTeam: false },
    });
    render(<StageCard stage={stage} uid="u1" bet={null} teams={['UAD']} />);
    expect(screen.getByTestId('pick-winnerTeam')).toBeTruthy();
    expect(screen.getByTestId('pick-mountainTeam')).toBeTruthy();
    expect(screen.queryByTestId('pick-gcTeam')).toBeNull();
    expect(screen.queryByTestId('pick-sprintTeam')).toBeNull();
  });

  it('viser antal ryttere (gcTopN) i bedste-hold-labellen', () => {
    render(<StageCard stage={openStage({ type: 'flat' })} uid="u1" bet={null} teams={['UAD']} gcTopN={15} />);
    expect(screen.getByText(/de første 15 ryttere/)).toBeTruthy();
  });
});

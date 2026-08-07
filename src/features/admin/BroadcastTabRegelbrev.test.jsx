import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { REGELBREV } from './regelbrev';

// Knappen findes kun på platformen, og PLATFORM_MODE læses ved import — derfor
// en egen testfil frem for et flag midt i den eksisterende (som kører i
// Tour-tilstand).
vi.mock('../../lib/platform', () => ({ PLATFORM_MODE: true }));
vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('./adminActions', () => ({ callSendBroadcastEmail: vi.fn() }));
vi.mock('./useUsers', () => ({ useUsers: () => ({ users: [], loading: false, error: '' }) }));
vi.mock('../leagues/useAllLeagues', () => ({ useAllLeagues: () => ({ leagues: [], loading: false, error: '' }) }));
vi.mock('../games/useGames', () => ({ useGames: () => ({ games: [], loading: false, error: '' }) }));
vi.mock('../games/useGameLeagues', () => ({ useGameLeagues: () => ({ leagues: [], loading: false, error: '' }) }));
vi.mock('./legacyResults', () => ({ fetchLegacyResults: () => Promise.resolve([]), applyLegacyResult: (x) => x }));

const { default: BroadcastTab } = await import('./BroadcastTab');

describe('Send mail — regelbrevet', () => {
  it('lægger brevet i emne og besked', () => {
    render(<BroadcastTab />);
    fireEvent.click(screen.getByTestId('broadcast-regelbrev'));
    expect(screen.getByTestId('broadcast-subject').value).toBe(REGELBREV.emne);
    expect(screen.getByTestId('broadcast-body').value).toBe(REGELBREV.tekst);
  });

  // Invitations-skabelonen bygger en hero med en gul TILMELDINGS-knap. Et brev
  // om pointreglen til folk, der allerede er med, må ikke lande som en
  // invitation — og skabelonen ville oven i købet kræve et liga-link, så
  // afsendelsen ville blive blokeret uden at det var åbenlyst hvorfor.
  it('slår invitations-skabelonen fra', () => {
    render(<BroadcastTab />);
    const skabelon = screen.getByTestId('broadcast-template');
    fireEvent.click(skabelon);                       // slå den til
    fireEvent.click(screen.getByTestId('broadcast-regelbrev'));
    expect(skabelon.checked).toBe(false);
  });
});

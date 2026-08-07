import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { REGELBREV } from './regelbrev';

// Knappen findes kun på platformen, og PLATFORM_MODE læses ved import — derfor
// en egen testfil frem for et flag midt i den eksisterende (som kører i
// Tour-tilstand).
vi.mock('../../lib/platform', () => ({ PLATFORM_MODE: true }));
vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('./adminActions', () => ({ callSendBroadcastEmail: vi.fn() }));
// Feltet, hele fejlen handlede om: 'c' er godkendt bruger, men deltager IKKE
// i Superligaen. Han skal med i knappen for ALLE og ude af den for spillet.
vi.mock('./useUsers', () => ({
  useUsers: () => ({
    users: [
      { id: 'u1', status: 'approved', email: 'med1@x.dk' },
      { id: 'u2', status: 'approved', email: 'med2@x.dk' },
      { id: 'c', status: 'approved', email: 'udenfor@x.dk' },   // ikke i spillet
      { id: 'u3', status: 'pending', email: 'spaerret@x.dk' },  // i spillet, men spærret
    ],
    loading: false, error: '',
  }),
}));
vi.mock('../leagues/useAllLeagues', () => ({ useAllLeagues: () => ({ leagues: [], loading: false, error: '' }) }));
vi.mock('../games/useGames', () => ({ useGames: () => ({ games: [{ id: 'sl2627', name: 'Superligaen', type: 'football' }], loading: false, error: '' }) }));
vi.mock('../games/useGameLeagues', () => ({ useGameLeagues: () => ({ leagues: [], loading: false, error: '' }) }));
// u1, u2 og u3 deltager i spillet. 'c' gør ikke.
const mockPlayerUids = vi.fn(() => ({ uids: ['u1', 'u2', 'u3'], loading: false, error: '' }));
vi.mock('../games/useGamePlayerUids', () => ({ useGamePlayerUids: (...a) => mockPlayerUids(...a) }));
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

// ---------------------------------------------------------------------------
// MODTAGERVALGET
//
// Fejlen: der fandtes kun ÉN knap, og den tog alle godkendte brugere, uanset
// hvilke spil de deltog i. Et brev om Superligaens regler gik derfor også til
// dem, der aldrig havde været med i Superligaen. En mail, der ikke vedkommer
// én, er den hurtigste måde at lære folk at lade være med at læse dem.
// ---------------------------------------------------------------------------
describe('Send mail — modtagere pr. spil', () => {
  const vaelgSpil = () => fireEvent.change(screen.getByTestId('broadcast-game'), { target: { value: 'sl2627' } });

  it('indsætter KUN deltagerne i det valgte spil', () => {
    render(<BroadcastTab />);
    vaelgSpil();
    fireEvent.click(screen.getByTestId('broadcast-add-game-players'));
    const ta = screen.getByTestId('broadcast-recipients');
    expect(ta.value).toContain('med1@x.dk');
    expect(ta.value).toContain('med2@x.dk');
    // DET AFGØRENDE: den, der ikke er med i spillet, må IKKE stå der.
    expect(ta.value).not.toContain('udenfor@x.dk');
  });

  // Samme regel som knappen for alle: en spærret bruger må ikke få post ad den
  // nye vej, bare fordi han står i spillets deltagerliste.
  it('tager ikke spærrede brugere med, selv om de deltager', () => {
    render(<BroadcastTab />);
    vaelgSpil();
    fireEvent.click(screen.getByTestId('broadcast-add-game-players'));
    expect(screen.getByTestId('broadcast-recipients').value).not.toContain('spaerret@x.dk');
  });

  it('viser antallet, så man kan se forskellen på de to knapper', () => {
    render(<BroadcastTab />);
    vaelgSpil();
    expect(screen.getByTestId('broadcast-add-game-players').textContent).toMatch(/Superligaen \(2\)/);
    expect(screen.getByTestId('broadcast-add-approved').textContent).toMatch(/ALLE godkendte \(3\)/);
  });

  it('kan ikke bruges, før et spil er valgt', () => {
    render(<BroadcastTab />);
    const knap = screen.getByTestId('broadcast-add-game-players');
    expect(knap).toBeDisabled();
    expect(knap.textContent).toMatch(/vælg spil ovenfor/i);
  });

  // Læsningen kræver global admin. Fejler den, skal det SIGES — ellers ser en
  // tom liste ud som "ingen deltagere", og brevet ryger til nul modtagere.
  it('viser fejlen, hvis deltagerlisten ikke kunne læses', () => {
    mockPlayerUids.mockReturnValueOnce({ uids: [], loading: false, error: 'Kræver global admin.' });
    render(<BroadcastTab />);
    expect(screen.getByTestId('broadcast-game-players-error').textContent).toMatch(/global admin/i);
  });
});

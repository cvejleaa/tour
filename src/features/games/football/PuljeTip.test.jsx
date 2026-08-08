// Pulje-vælgeren skal vise SPILLETS hold.
//
// Den var det eneste sted i fodbold-fladen, der ikke allerede faldt tilbage på
// `game.teams` — den importerede den danske holdliste direkte. På et engelsk
// spil ville vælgeren derfor have vist tolv danske klubber, og et tip ville
// have været umuligt at afgive rigtigt.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../firebase', () => ({ db: {} }));

// Firestore-lytteren: svar med "intet tip endnu" og hold komponenten i ro.
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'A' } }),
}));

vi.mock('../gameActions', () => ({ setPuljeBet: vi.fn() }));

import PuljeTip from './PuljeTip';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';

beforeEach(() => vi.clearAllMocks());

describe('PuljeTip — holdene kommer fra spillet', () => {
  it('viser de engelske hold på et Premier League-spil', () => {
    render(<PuljeTip game={{ id: 'pl', teams: PREMIER_LEAGUE_TEAMS_2026 }} matches={[]} />);
    expect(screen.getByText('Arsenal')).toBeInTheDocument();
    expect(screen.getByText('Manchester City')).toBeInTheDocument();
    // …og ingen danske. Dét var fejlen.
    expect(screen.queryByText('Brøndby IF')).not.toBeInTheDocument();
    expect(screen.queryByText('F.C. København')).not.toBeInTheDocument();
  });

  it('viser de danske hold på Superligaen', () => {
    render(<PuljeTip game={{ id: 'sl', teams: SUPERLIGA_TEAMS_2026 }} matches={[]} />);
    expect(screen.getByText('Brøndby IF')).toBeInTheDocument();
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument();
  });

  // Fallbacken må ikke vinde over spillets egne hold — den er kun til et spil,
  // der endnu ikke er seedet.
  it('falder tilbage på Superligaen for et spil uden hold', () => {
    render(<PuljeTip game={{ id: 'nyt' }} matches={[]} />);
    expect(screen.getByText('Brøndby IF')).toBeInTheDocument();
  });
});

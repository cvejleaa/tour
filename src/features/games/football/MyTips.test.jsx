// Tests for MyTips — især vejen videre, når man endnu ikke har tippet.
// Filen fandtes ikke før, så "Gå til Tip"-linket var helt udækket.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockBets = vi.fn();
vi.mock('../useGameBets', () => ({ useGameBets: () => mockBets() }));

import MyTips from './MyTips';

const MATCHES = [
  {
    id: 'm1', round: 1, home: 'AGF', away: 'F.C. København',
    kickoff: new Date('2026-09-01T18:00:00Z'), odds: null, result: null,
  },
];

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/spil/sl?fane=mine']}>
    <Routes>
      <Route
        path="/spil/:gameId"
        element={<MyTips game={{ id: 'sl', type: 'football' }} matches={MATCHES} {...props} />}
      />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mockBets.mockReturnValue({ betsByMatch: {}, loading: false });
});

describe('MyTips', () => {
  it('siger til, når man ikke har tippet endnu', () => {
    setup();
    expect(screen.getByText(/ikke tippet endnu/i)).toBeInTheDocument();
  });

  // Tomme tilstande skal have en vej videre, ikke bare en anvisning.
  it('sender én uden tips videre til Tip-fanen', () => {
    setup();
    expect(screen.getByRole('link', { name: /Gå til Tip/ }))
      .toHaveAttribute('href', '/spil/sl');
  });

  it('viser en spinner, mens tippene hentes', () => {
    mockBets.mockReturnValue({ betsByMatch: {}, loading: true });
    setup();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

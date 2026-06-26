import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockHook = vi.fn();
vi.mock('./useTopScorers', () => ({ useTopScorers: () => mockHook() }));

import TopScorersCard from './TopScorersCard';

describe('TopScorersCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('viser intet mens der indlæses', () => {
    mockHook.mockReturnValue({ list: [], updatedAt: null, loading: true });
    const { container } = render(<TopScorersCard />);
    expect(container.firstChild).toBeNull();
  });

  it('viser intet når listen er tom (fx før turneringen / tier uden scorers)', () => {
    mockHook.mockReturnValue({ list: [], updatedAt: null, loading: false });
    const { container } = render(<TopScorersCard />);
    expect(container.firstChild).toBeNull();
  });

  it('viser topscorere med mål og medaljer', () => {
    mockHook.mockReturnValue({
      loading: false,
      updatedAt: null,
      list: [
        { rank: 1, playerId: 1, playerName: 'Haaland', teamName: 'Norge', goals: 6, assists: 2 },
        { rank: 2, playerId: 2, playerName: 'Mbappé', teamName: 'Frankrig', goals: 5, assists: null },
      ],
    });
    render(<TopScorersCard />);
    expect(screen.getByText(/Kapløbet om guldstøvlen/i)).toBeInTheDocument();
    expect(screen.getByText('Haaland')).toBeInTheDocument();
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('respekterer limit-prop', () => {
    mockHook.mockReturnValue({
      loading: false,
      updatedAt: null,
      list: Array.from({ length: 10 }, (_, i) => ({
        rank: i + 1, playerId: i, playerName: `Spiller ${i + 1}`, teamName: 'X', goals: 10 - i,
      })),
    });
    render(<TopScorersCard limit={3} />);
    expect(screen.getByText('Spiller 1')).toBeInTheDocument();
    expect(screen.getByText('Spiller 3')).toBeInTheDocument();
    expect(screen.queryByText('Spiller 4')).not.toBeInTheDocument();
  });
});

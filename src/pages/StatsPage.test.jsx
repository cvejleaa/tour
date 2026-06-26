import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../features/stats/useStatsData', () => ({ useStatsData: vi.fn() }));

import StatsPage from './StatsPage';
import { useStatsData } from '../features/stats/useStatsData';

const baseData = {
  todayMatches: [],
  matches: [],
  betsByMatch: new Map(),
  usersById: {},
  pointsByUidToday: {},
  loading: false,
  error: null,
};

beforeEach(() => {
  useStatsData.mockReturnValue(baseData);
});

describe('StatsPage', () => {
  it('viser "Hele turneringen" som standard-fane', () => {
    render(<StatsPage />);
    const season = screen.getByRole('tab', { name: /Hele turneringen/ });
    expect(season).toHaveAttribute('aria-selected', 'true');
    const today = screen.getByRole('tab', { name: /I dag/ });
    expect(today).toHaveAttribute('aria-selected', 'false');
  });

  it('kan skifte til "I dag"-fanen', () => {
    render(<StatsPage />);
    fireEvent.click(screen.getByRole('tab', { name: /I dag/ }));
    expect(screen.getByRole('tab', { name: /I dag/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Dagens kampe')).toBeInTheDocument();
  });
});

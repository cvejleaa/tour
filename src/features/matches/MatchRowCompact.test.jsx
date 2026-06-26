import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MatchRowCompact from './MatchRowCompact';

describe('MatchRowCompact', () => {
  const base = {
    id: 'm1', round: 'group', homeTeam: 'GER', awayTeam: 'ESP',
    status: 'finished', result: { home: 2, away: 1 },
  };

  it('viser hold og endeligt resultat', () => {
    render(<MatchRowCompact match={base} onClick={() => {}} />);
    expect(screen.getByTestId('compact-result')).toHaveTextContent('2–1');
    expect(screen.getByText('Tyskland')).toBeInTheDocument();
    expect(screen.getByText('Spanien')).toBeInTheDocument();
  });

  it('kalder onClick ved klik og Enter', () => {
    const onClick = vi.fn();
    render(<MatchRowCompact match={base} onClick={onClick} />);
    const row = screen.getByTestId('match-row-compact');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('viser "videre"-badge for afgjort knockout', () => {
    const ko = { ...base, round: 'qf', result: { home: 1, away: 1, advance: 'GER' } };
    render(<MatchRowCompact match={ko} onClick={() => {}} />);
    expect(screen.getByText(/Tyskland videre/)).toBeInTheDocument();
  });

  it('håndterer manglende resultat uden at crashe', () => {
    const noResult = { ...base, status: 'scheduled', result: null };
    render(<MatchRowCompact match={noResult} onClick={() => {}} />);
    expect(screen.getByTestId('compact-result')).toHaveTextContent('–');
  });
});

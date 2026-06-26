import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TodoCard from './TodoCard';

const mockTasks = vi.fn();
vi.mock('../../context/TasksContext', () => ({ useTasks: () => mockTasks() }));

function renderCard() {
  return render(<MemoryRouter><TodoCard /></MemoryRouter>);
}

describe('TodoCard', () => {
  it('viser hver kategori med antal når der mangler', () => {
    mockTasks.mockReturnValue({
      matchCount: 3, bonusCount: 2,
      leagueBonus: { total: 1, byLeague: [{ leagueId: 'L1', name: 'Kontoret', count: 1 }] },
      total: 6,
    });
    renderCard();
    expect(screen.getByText('6 mangler')).toBeInTheDocument();
    expect(screen.getByText(/kampe mangler tip/)).toBeInTheDocument();
    expect(screen.getByText(/bonusspørgsmål åbne/)).toBeInTheDocument();
    expect(screen.getByText(/Kontoret: liga-spørgsmål mangler/)).toBeInTheDocument();
  });

  it('viser "alt besvaret" når total er 0', () => {
    mockTasks.mockReturnValue({ matchCount: 0, bonusCount: 0, leagueBonus: { total: 0, byLeague: [] }, total: 0 });
    renderCard();
    expect(screen.getByText(/Alt besvaret/)).toBeInTheDocument();
    expect(screen.queryByText(/mangler tip/)).not.toBeInTheDocument();
  });

  it('skjuler kategorier uden mangler', () => {
    mockTasks.mockReturnValue({ matchCount: 0, bonusCount: 2, leagueBonus: { total: 0, byLeague: [] }, total: 2 });
    renderCard();
    expect(screen.queryByText(/mangler tip/)).not.toBeInTheDocument();
    expect(screen.getByText(/bonusspørgsmål åbne/)).toBeInTheDocument();
  });
});

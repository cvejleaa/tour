import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MatchDetails from './MatchDetails';

const base = { homeTeam: 'BRA', awayTeam: 'ARG' };

describe('MatchDetails', () => {
  it('viser intet uden details', () => {
    const { container } = render(<MatchDetails match={base} homeName="Brasilien" awayName="Argentina" />);
    expect(container.firstChild).toBeNull();
  });

  it('viser mål-feed med scorer, assist og minut', () => {
    const match = { ...base, details: {
      goals: [{ minute: 23, type: 'REGULAR', side: 'home', scorer: 'Neymar', assist: 'Vinicius' }],
      bookings: [], lineups: null, halfTime: { home: 1, away: 0 }, attendance: 50000,
    } };
    render(<MatchDetails match={match} homeName="Brasilien" awayName="Argentina" />);
    expect(screen.getByText(/Neymar/)).toBeInTheDocument();
    expect(screen.getByText(/assist: Vinicius/)).toBeInTheDocument();
    expect(screen.getByText(/23'/)).toBeInTheDocument();
    expect(screen.getByText(/Halvleg 1–0/)).toBeInTheDocument();
    expect(screen.getByText(/50.000 tilskuere/)).toBeInTheDocument();
  });

  it('viser løbende stilling ved hvert mål', () => {
    const match = { ...base, details: {
      goals: [
        { minute: 10, type: 'REGULAR', side: 'home', scorer: 'A' },
        { minute: 20, type: 'REGULAR', side: 'away', scorer: 'B' },
        { minute: 30, type: 'OWN', side: 'away', scorer: 'C' },
      ],
      bookings: [{ minute: 25, side: 'home', player: 'D', card: 'YELLOW' }],
      lineups: null,
    } };
    render(<MatchDetails match={match} homeName="BRA" awayName="ARG" />);
    const scores = screen.getAllByTestId('running-score').map((el) => el.textContent);
    // 1–0, 1–1, og selvmål af ude-spiller → hjemme fører 2–1. Kortet har ingen score.
    expect(scores).toEqual(['1–0', '1–1', '2–1']);
  });

  it('viser udskiftninger i tidslinjen med ind/ud-spiller', () => {
    const match = { ...base, details: {
      goals: [], bookings: [],
      substitutions: [{ minute: 71, side: 'home', playerIn: 'Endrick', playerOut: 'Neymar' }],
    } };
    render(<MatchDetails match={match} homeName="Brasilien" awayName="Argentina" />);
    expect(screen.getByText(/Endrick ↑ Neymar ↓/)).toBeInTheDocument();
    expect(screen.getByText(/71'/)).toBeInTheDocument();
  });

  it('viser selvmål på modstanderens (begunstigede) side', () => {
    // Selvmål af et hjemmehold-spiller tæller for udeholdet → skal stå til højre.
    const match = { ...base, details: {
      goals: [{ minute: 7, type: 'OWN', side: 'home', scorer: 'Bobadilla' }],
      bookings: [], lineups: null,
    } };
    render(<MatchDetails match={match} homeName="USA" awayName="Paraguay" />);
    const row = screen.getByText(/Bobadilla/).closest('div').parentElement;
    // Navnet ligger i den højre (ude) kolonne — venstre kolonne er gennemsigtig/tom.
    const cols = row.querySelectorAll(':scope > div');
    expect(cols[0].textContent).not.toMatch(/Bobadilla/); // venstre (hjemme) tom
    expect(cols[2].textContent).toMatch(/Bobadilla.*selvmål/); // højre (ude)
  });

  it('udfolder opstillinger ved klik', () => {
    const match = { ...base, details: {
      goals: [], bookings: [],
      lineups: {
        home: { formation: '4-3-3', coach: 'Træner', lineup: [{ name: 'Alisson', shirt: 1, position: 'Goalkeeper' }], bench: [] },
        away: { formation: '4-4-2', coach: null, lineup: [{ name: 'Martinez', shirt: 1 }], bench: [] },
      },
    } };
    render(<MatchDetails match={match} homeName="Brasilien" awayName="Argentina" />);
    expect(screen.queryByText(/Alisson/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Vis opstillinger/i }));
    expect(screen.getByText(/Alisson/)).toBeInTheDocument();
    expect(screen.getByText(/4-3-3/)).toBeInTheDocument();
  });
});

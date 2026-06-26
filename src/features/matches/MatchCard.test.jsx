// Tests for MatchCard – bekræfter låst-tilstand, resultat og point.
import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// MatchCard indeholder <TeamLink> (et <Link>), så render kræver en Router-kontekst.
const render = (ui, opts) =>
  rtlRender(ui, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>, ...opts });

// Mock Firebase
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

// Mock Countdown-komponenten (undgå timer-problemer)
vi.mock('./Countdown', () => ({
  default: () => <span data-testid="countdown">Countdown</span>,
}));

import MatchCard from './MatchCard';
import { setDoc } from 'firebase/firestore';

// Hjælper: kickoff i fortiden (låst)
const pastKickoff = new Date('2020-01-01T12:00:00Z');
// Hjælper: kickoff i fremtiden (åben)
const futureKickoff = new Date('2099-01-01T12:00:00Z');

function makeMatch(overrides = {}) {
  return {
    id: 'match1',
    round: 'group',
    groupName: 'A',
    homeTeam: 'DK',
    awayTeam: 'FR',
    kickoff: futureKickoff,
    status: 'scheduled',
    result: null,
    stadium: 'Parken',
    city: 'København',
    ...overrides,
  };
}

describe('MatchCard – grundlæggende rendering', () => {
  it('viser fuldt holdnavn for GER (Tyskland)', () => {
    const m = makeMatch({ homeTeam: 'GER', awayTeam: 'FRA' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByText('Tyskland')).toBeInTheDocument();
  });

  it('viser fuldt holdnavn for FRA (Frankrig)', () => {
    const m = makeMatch({ homeTeam: 'GER', awayTeam: 'FRA' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByText('Frankrig')).toBeInTheDocument();
  });

  it('viser fallback-koden for ukendte hold (fx DK er ikke i teams.js)', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    // 'DK' er ikke i TEAMS-mapping → falder tilbage til selve koden
    expect(screen.getByText('DK')).toBeInTheDocument();
    expect(screen.getByText('FR')).toBeInTheDocument();
  });

  it('viser match-card container', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByTestId('match-card')).toBeInTheDocument();
  });

  it('viser runde + gruppe i headeren (Gruppespil · Gruppe A)', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByText(/Gruppe A/)).toBeInTheDocument();
  });

  it('viser "vs" tekst for uafgjort kamp', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByText('vs')).toBeInTheDocument();
  });
});

describe('MatchCard – låst-tilstand', () => {
  it('viser IKKE låst-badge for fremtidig kamp', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.queryByTestId('locked-badge')).not.toBeInTheDocument();
  });

  it('viser låst-badge for en kamp der allerede er startet', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('locked-badge')).toBeInTheDocument();
  });

  it('viser countdown for ulåst kamp', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByTestId('countdown')).toBeInTheDocument();
  });

  it('viser IKKE countdown for låst kamp', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument();
  });
});

describe('MatchCard – resultater og point', () => {
  it('viser resultatet når kampen er finished', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 },
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('match-result')).toHaveTextContent('2–1');
  });

  it('viser løbende score og spilleminut når kampen er live', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'live',
      result: { home: 1, away: 0 },
      details: { minute: 43 },
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('match-result')).toHaveTextContent('1–0');
    expect(screen.getByTestId('live-minute')).toHaveTextContent("1. halvleg · 43'");
  });

  it('viser optjente point for bruger med tip', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 },
    });
    // Korrekt udfald men forkert score → 2 point
    const bet = { home: 3, away: 1, matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toBeInTheDocument();
  });

  it('viser +5 point ved eksakt score', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 },
    });
    const bet = { home: 2, away: 1, matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toHaveTextContent('+5 point');
  });

  it('viser +3 point for korrekt udfald + korrekt målforskel (men ikke eksakt)', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 3, away: 1 }, // målforskel +2
    });
    const bet = { home: 2, away: 0, matchId: 'match1' }; // målforskel +2, men ikke eksakt
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toHaveTextContent('+3 point');
  });

  it('viser +2 point for korrekt udfald (men forkert målforskel)', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 },
    });
    const bet = { home: 3, away: 1, matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toHaveTextContent('+2 point');
  });

  it('viser 0 point for forkert udfald', () => {
    const m = makeMatch({
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1 }, // hjemmesejr
    });
    const bet = { home: 0, away: 2, matchId: 'match1' }; // udesejr
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toHaveTextContent('0 point');
  });

  it('viser IKKE earned-points for åben kamp med tip', () => {
    const bet = { home: 2, away: 1, matchId: 'match1' };
    render(<MatchCard match={makeMatch()} uid="u1" bet={bet} />);
    expect(screen.queryByTestId('earned-points')).not.toBeInTheDocument();
  });

  it('viser brugerens tip under låst kamp (ikke afgjort)', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    const bet = { home: 2, away: 1, matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByText(/Dit tip:/)).toBeInTheDocument();
    expect(screen.getByText(/2–1/)).toBeInTheDocument();
  });
});

describe('MatchCard – ScoreInput formular', () => {
  it('viser "Intet tip afgivet" for låst kamp uden tip', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('no-bet-msg')).toBeInTheDocument();
  });

  it('viser ScoreInput for fremtidig åben kamp', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByTestId('score-home')).toBeInTheDocument();
    expect(screen.getByTestId('score-away')).toBeInTheDocument();
  });

  it('skjuler ScoreInput for låst kamp', () => {
    const m = makeMatch({ kickoff: pastKickoff });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.queryByTestId('score-home')).not.toBeInTheDocument();
  });

  it('udfylder score-felter med eksisterende bet', () => {
    const bet = { home: 3, away: 2, matchId: 'match1' };
    render(<MatchCard match={makeMatch()} uid="u1" bet={bet} />);
    expect(screen.getByTestId('score-home').value).toBe('3');
    expect(screen.getByTestId('score-away').value).toBe('2');
  });

  it('kalder setDoc ved gem af tip', async () => {
    const bet = null;
    render(<MatchCard match={makeMatch()} uid="u1" bet={bet} />);
    fireEvent.change(screen.getByTestId('score-home'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('score-away'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('score-save'));
    await waitFor(() => {
      expect(setDoc).toHaveBeenCalled();
    });
  });

  it('viser "Op til 5 point muligt" for gruppekamp', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByText(/Op til 5 point muligt/)).toBeInTheDocument();
  });
});

describe('MatchCard – pendingTeams', () => {
  it('viser pending-teams besked for ukendte hold', () => {
    const m = makeMatch({
      homeTeam: null,
      awayTeam: null,
      homePlaceholder: 'Vinder gruppe A',
      awayPlaceholder: 'Vinder gruppe B',
      status: 'pendingTeams',
      kickoff: futureKickoff,
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('pending-teams-msg')).toBeInTheDocument();
  });

  it('viser placeholder-tekster for ukendte hold', () => {
    const m = makeMatch({
      homeTeam: null,
      awayTeam: null,
      homePlaceholder: 'Vinder gruppe A',
      awayPlaceholder: 'Vinder gruppe B',
      status: 'pendingTeams',
      kickoff: futureKickoff,
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByText('Vinder gruppe A')).toBeInTheDocument();
    expect(screen.getByText('Vinder gruppe B')).toBeInTheDocument();
  });

  it('viser ❓ for ukendte hold (ingen flag)', () => {
    const m = makeMatch({
      homeTeam: null,
      awayTeam: null,
      homePlaceholder: 'Vinder gruppe A',
      awayPlaceholder: 'Vinder gruppe B',
      status: 'pendingTeams',
      kickoff: futureKickoff,
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    const question = screen.getAllByText('❓');
    expect(question.length).toBeGreaterThan(0);
  });

  it('skjuler ScoreInput for pendingTeams kamp', () => {
    const m = makeMatch({
      homeTeam: null,
      awayTeam: null,
      status: 'pendingTeams',
      kickoff: futureKickoff,
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.queryByTestId('score-home')).not.toBeInTheDocument();
  });
});

describe('MatchCard – knockout-kampe', () => {
  it('viser advance-valg for knockout-kamp (qf)', () => {
    const m = makeMatch({ round: 'qf' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('advance-DK')).toBeInTheDocument();
    expect(screen.getByTestId('advance-FR')).toBeInTheDocument();
  });

  it('viser advance-knap med fuldt holdnavn for kendte koder', () => {
    const m = makeMatch({ round: 'sf', homeTeam: 'GER', awayTeam: 'FRA' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    // GER = Tyskland, FRA = Frankrig
    expect(screen.getByTestId('advance-GER')).toHaveTextContent('Tyskland');
    expect(screen.getByTestId('advance-FRA')).toHaveTextContent('Frankrig');
  });

  it('viser videre-resultat for afgjort knockout med kendt holdkode', () => {
    const m = makeMatch({
      round: 'sf',
      homeTeam: 'GER',
      awayTeam: 'FRA',
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 1, away: 0, advance: 'GER' },
    });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('advance-result')).toHaveTextContent('Tyskland');
  });

  it('viser "Op til 7 point muligt" for knockout', () => {
    const m = makeMatch({ round: 'qf' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByText(/Op til 7 point muligt/)).toBeInTheDocument();
  });

  it('viser "Hvem går videre?" label for knockout', () => {
    const m = makeMatch({ round: 'final' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByText(/Hvem går videre/)).toBeInTheDocument();
  });

  it('viser advance-knapper for r32-kamp', () => {
    const m = makeMatch({ round: 'r32' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.getByTestId('advance-DK')).toBeInTheDocument();
    expect(screen.getByTestId('advance-FR')).toBeInTheDocument();
  });

  it('viser advance-bonus-point for knockout i teksten', () => {
    const m = makeMatch({ round: 'qf' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    // Bør vise "5 for score + 2 for videre"
    expect(screen.getByText(/5 for score/)).toBeInTheDocument();
    expect(screen.getByText(/2 for videre/)).toBeInTheDocument();
  });

  it('viser eksisterende advance-valg fra bet', () => {
    const m = makeMatch({ round: 'qf' });
    const bet = { home: 2, away: 1, advance: 'DK', matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    // DK-knappen bør have klassen btn (aktiv), ikke btn--ghost
    const dkBtn = screen.getByTestId('advance-DK');
    expect(dkBtn).toBeInTheDocument();
  });

  it('viser advance i brugerens tip for låst knockout (ikke afgjort)', () => {
    const m = makeMatch({
      round: 'sf',
      kickoff: pastKickoff,
      status: 'live',
    });
    const bet = { home: 2, away: 1, advance: 'FR', matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByText(/Videre: FR/)).toBeInTheDocument();
  });

  it('+2 ekstrapoint for korrekt advance i knockout', () => {
    const m = makeMatch({
      round: 'qf',
      homeTeam: 'GER',
      awayTeam: 'FRA',
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1, advance: 'GER' },
    });
    // Korrekt advance: GER. Eksakt score 2-1 = 5 + 2 = 7 point
    const bet = { home: 2, away: 1, advance: 'GER', matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toHaveTextContent('+7 point');
  });

  it('INGEN advance-bonus for forkert advance i knockout', () => {
    const m = makeMatch({
      round: 'qf',
      homeTeam: 'GER',
      awayTeam: 'FRA',
      kickoff: pastKickoff,
      status: 'finished',
      result: { home: 2, away: 1, advance: 'GER' },
    });
    // Eksakt score men forkert advance → 5 point (ikke 7)
    const bet = { home: 2, away: 1, advance: 'FRA', matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('earned-points')).toHaveTextContent('+5 point');
  });
});

describe('MatchCard – Flag-komponent', () => {
  it('viser Flag-komponent for hjemmehold (GER = Tyskland)', () => {
    const m = makeMatch({ homeTeam: 'GER', awayTeam: 'FRA' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    // Flag-komponenten renderer img med alt=holdnavn (GER = Tyskland)
    const imgs = screen.getAllByRole('img');
    expect(imgs.some((img) => img.alt === 'Tyskland')).toBe(true);
  });

  it('viser Flag-komponent for udehold (FRA = Frankrig)', () => {
    const m = makeMatch({ homeTeam: 'GER', awayTeam: 'FRA' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    const imgs = screen.getAllByRole('img');
    expect(imgs.some((img) => img.alt === 'Frankrig')).toBe(true);
  });

  it('viser flag for BRA (Brasilien)', () => {
    const m = makeMatch({ homeTeam: 'BRA', awayTeam: 'ARG' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    const imgs = screen.getAllByRole('img');
    expect(imgs.some((img) => img.alt === 'Brasilien')).toBe(true);
    expect(imgs.some((img) => img.alt === 'Argentina')).toBe(true);
  });
});

describe('MatchCard – runde-labels', () => {
  it('viser "Gruppespil" for group', () => {
    render(<MatchCard match={makeMatch({ round: 'group' })} uid="u1" bet={null} />);
    expect(screen.getByText(/Gruppespil/)).toBeInTheDocument();
  });

  it('viser "Finale" for final', () => {
    render(<MatchCard match={makeMatch({ round: 'final', groupName: null })} uid="u1" bet={null} />);
    expect(screen.getByText(/Finale/)).toBeInTheDocument();
  });

  it('viser "Semifinale" for sf', () => {
    render(<MatchCard match={makeMatch({ round: 'sf', groupName: null })} uid="u1" bet={null} />);
    expect(screen.getByText(/Semifinale/)).toBeInTheDocument();
  });
});

describe('MatchCard – tippet-markering', () => {
  it('viser "✓ Tippet"-badge når der findes et tip', () => {
    const bet = { home: 2, away: 1, matchId: 'match1' };
    render(<MatchCard match={makeMatch()} uid="u1" bet={bet} />);
    expect(screen.getByTestId('tipped-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('untipped-badge')).not.toBeInTheDocument();
  });

  it('viser "Mangler tip"-badge for åben kamp uden tip', () => {
    render(<MatchCard match={makeMatch()} uid="u1" bet={null} />);
    expect(screen.getByTestId('untipped-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('tipped-badge')).not.toBeInTheDocument();
  });

  it('viser hverken tippet- eller mangler-badge på låst kamp uden tip', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    render(<MatchCard match={m} uid="u1" bet={null} />);
    expect(screen.queryByTestId('untipped-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tipped-badge')).not.toBeInTheDocument();
  });

  it('viser "✓ Tippet" på låst kamp hvis man nåede at tippe', () => {
    const m = makeMatch({ kickoff: pastKickoff, status: 'live' });
    const bet = { home: 1, away: 0, matchId: 'match1' };
    render(<MatchCard match={m} uid="u1" bet={bet} />);
    expect(screen.getByTestId('tipped-badge')).toBeInTheDocument();
  });
});

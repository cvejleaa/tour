/**
 * DashboardPage — brugerens forside ("/"). Samler overblik og handlinger:
 * personlig velkomst, "Mine opgaver", næste kamp, og placering. Selve
 * kamplisten bor nu på sin egen side (/kampe).
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStandings } from '../features/leaderboard/useStandings';
import { collectVisibleUids } from '../features/leaderboard/standingsUtils';
import { useLeagues } from '../features/leagues/useLeagues';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import Hero from '../components/Hero';
import DashboardHub from '../features/matches/DashboardHub';
import DayMatchesCard from '../features/matches/DayMatchesCard';
import MyStatsCard from '../features/dashboard/MyStatsCard';
import MiniStandings from '../features/dashboard/MiniStandings';
import RecentResultsCard from '../features/dashboard/RecentResultsCard';
import TodoCard from '../features/dashboard/TodoCard';
import OnboardingChecklist from '../features/onboarding/OnboardingChecklist';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { standings } = useStandings();
  const { leagues, loading: leaguesLoading } = useLeagues(user?.uid);
  const { matches, loading: matchesLoading, error } = useMatches();
  const { bets } = useMyBets(user?.uid ?? null);

  const name = profile?.displayName || 'spiller';

  // Forsidens stilling viser kun de spillere, man deler en liga med (plus én selv) —
  // samme afgrænsning som Stilling-siden bruger som standard.
  const visibleStandings = useMemo(() => {
    const visible = new Set(collectVisibleUids(leagues, user?.uid));
    return standings.filter((u) => visible.has(u.uid));
  }, [standings, leagues, user?.uid]);

  // Min placering + point blandt mine liga-medspillere.
  // Ægte konkurrence-placering: deler man point, deler man plads
  // (alle på 0 point → alle nr. 1).
  const { rank, points, playerCount } = useMemo(() => {
    const mine = visibleStandings.find((u) => u.uid === user?.uid);
    const myPoints = mine?.totalPoints ?? profile?.totalPoints ?? 0;
    const ahead = visibleStandings.filter((u) => (u.totalPoints ?? 0) > myPoints).length;
    return { rank: ahead + 1, points: myPoints, playerCount: visibleStandings.length };
  }, [visibleStandings, user?.uid, profile?.totalPoints]);

  const chips = [
    leaguesLoading
      ? 'Placering: …'
      : (playerCount > 0 ? `Placering: #${rank} af ${playerCount}` : 'Placering: –'),
    `Point: ${points}`,
  ];

  return (
    <div className="container">
      <Hero
        title={`Hej, ${name}`}
        subtitle="Her er dit overblik – hvad mangler du at svare på, og hvornår er næste kamp?"
        chips={chips}
      />

      <OnboardingChecklist uid={user?.uid} />

      <TodoCard />

      {!matchesLoading && !error && (
        <DashboardHub
          matches={matches}
          bets={bets}
          onJumpToUntipped={() => navigate('/kampe?filter=utippede')}
        />
      )}

      {!matchesLoading && !error && <DayMatchesCard matches={matches} />}

      {!leaguesLoading && <MiniStandings standings={visibleStandings} uid={user?.uid} />}

      {!matchesLoading && !error && (
        <div className="dashboard-stats-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <MyStatsCard matches={matches} bets={bets} />
          <RecentResultsCard matches={matches} bets={bets} />
        </div>
      )}

      {/* Genveje */}
      <div className="card" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link className="btn" to="/kampe">⚽ Til kampene</Link>
        <Link className="btn btn--ghost" to="/stilling">🏆 Stilling</Link>
        <Link className="btn btn--ghost" to="/ligaer">👥 Ligaer</Link>
        <Link className="btn btn--ghost" to="/hjaelp">❓ Sådan virker det</Link>
      </div>
    </div>
  );
}

/**
 * DashboardPage — brugerens forside ("/"). Samler overblik og handlinger:
 * personlig velkomst, "Mine opgaver", næste etape at tippe, seneste resultater
 * og placering. Selve etapelisten bor på sin egen side (/etaper).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStandings } from '../features/leaderboard/useStandings';
import { collectVisibleUids } from '../features/leaderboard/standingsUtils';
import { useLeagues } from '../features/leagues/useLeagues';
import { useStages } from '../features/stages/useStages';
import { useTeams } from '../features/stages/useTeams';
import { useMyStageBets } from '../features/stages/useMyStageBets';
import { useActiveSeason } from '../features/stages/useActiveSeason';
import { useTourSettings } from '../features/stages/useTourSettings';
import { stageStatus } from '../lib/tourStages';
import { stageTipComplete } from '../lib/tourScoring';
import { placeholderRoute2026 } from '../data/route2026';
import Hero from '../components/Hero';
import StageCard from '../features/stages/StageCard';
import MyStatsCard from '../features/dashboard/MyStatsCard';
import MiniStandings from '../features/dashboard/MiniStandings';
import RecentResultsCard from '../features/dashboard/RecentResultsCard';
import TodoCard from '../features/dashboard/TodoCard';
import OnboardingChecklist from '../features/onboarding/OnboardingChecklist';

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { standings } = useStandings();
  const { leagues, loading: leaguesLoading } = useLeagues(user?.uid);
  const season = useActiveSeason();
  const { points: stagePoints } = useTourSettings();
  const { stages: dbStages, loading: stagesLoading } = useStages(season);
  const { teams } = useTeams(season);
  const { betsByStage } = useMyStageBets(user?.uid ?? null, season);

  const name = profile?.displayName || 'spiller';

  // Brug rigtige etaper hvis de findes, ellers placeholder-ruten for sæsonen.
  const stages = dbStages.length ? dbStages : placeholderRoute2026(season);

  // Næste etape at tippe: første åbne etape uden KOMPLET hold-tip (alle aktive
  // spørgsmål besvaret), ellers første åbne. Samme "komplet"-definition som
  // forsidens "Mine opgaver" og etape-listen, så de altid stemmer overens.
  const nextStage = useMemo(() => {
    const open = stages
      .filter((s) => stageStatus(s, Date.now()) === 'scheduled')
      .sort((a, b) => a.number - b.number);
    return open.find((s) => !stageTipComplete(s, betsByStage[s.id])) || open[0] || null;
  }, [stages, betsByStage]);

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
        subtitle="Her er dit overblik – hvad mangler du at svare på, og hvornår er næste etape?"
        chips={chips}
      />

      <OnboardingChecklist uid={user?.uid} />

      <TodoCard />

      {/* Næste etape at tippe */}
      {!stagesLoading && nextStage && (
        <div style={{ marginBottom: '1rem' }}>
          <h2 className="card__title" style={{ margin: '0 0 0.5rem' }}>🚴 Næste etape</h2>
          <StageCard
            stage={nextStage}
            uid={user?.uid}
            bet={betsByStage[nextStage.id] || null}
            teams={teams}
            points={stagePoints}
          />
        </div>
      )}

      {!leaguesLoading && <MiniStandings standings={visibleStandings} uid={user?.uid} />}

      {!stagesLoading && (
        <div className="dashboard-stats-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <MyStatsCard stages={stages} bets={betsByStage} />
          <RecentResultsCard stages={stages} bets={betsByStage} />
        </div>
      )}

      {/* Genveje */}
      <div className="card" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link className="btn" to="/etaper">🚴 Til etaperne</Link>
        <Link className="btn btn--ghost" to="/stilling">🏆 Stilling</Link>
        <Link className="btn btn--ghost" to="/ligaer">👥 Ligaer</Link>
        <Link className="btn btn--ghost" to="/hjaelp">❓ Sådan virker det</Link>
      </div>
    </div>
  );
}

/**
 * DashboardPage — brugerens forside ("/"). Samler overblik og handlinger:
 * personlig velkomst, "Mine opgaver", næste etape at tippe, seneste resultater
 * og placering. Selve etapelisten bor på sin egen side (/etaper).
 */
import { useMemo, useState } from 'react';
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
import { placeholderRoute2026 } from '../data/route2026';
import Hero from '../components/Hero';
import StageCard from '../features/stages/StageCard';
import StageAnswers from '../features/stages/StageAnswers';
import LiveTicker from '../features/live/LiveTicker';
import { isTodayInCopenhagen } from '../features/live/liveTickerUtils';
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
  const { points: stagePoints, gcTopN } = useTourSettings();
  // Fold-ud af "alles tips" på forsiden — indholdet renderes (og bets hentes)
  // først når man faktisk åbner den.
  const [answersOpen, setAnswersOpen] = useState(false);
  const { stages: dbStages, loading: stagesLoading } = useStages(season);
  const { teams } = useTeams(season);
  const { betsByStage } = useMyStageBets(user?.uid ?? null, season);

  const name = profile?.displayName || 'spiller';

  // Brug rigtige etaper hvis de findes, ellers placeholder-ruten for sæsonen.
  const stages = dbStages.length ? dbStages : placeholderRoute2026(season);

  // Næste etape = den KRONOLOGISK næste åbne etape (den der starter først og
  // stadig kan tippes) — ikke den næste utippede. Så "Næste etape" matcher det
  // man forventer (fx etape 1 før løbet er gået i gang), uanset hvor mange man
  // allerede har tippet. Nudget til at tippe ligger i "Mine opgaver" ovenfor.
  const nextStage = useMemo(() => {
    const open = stages
      .filter((s) => stageStatus(s, Date.now()) === 'scheduled')
      .sort((a, b) => a.number - b.number);
    return open[0] || null;
  }, [stages]);

  // Dagens LIVE etape: startet i dag (dansk tid) — tickeren følger med hele
  // aftenen (også efter målgang, hvor mål-opslagene lander). `done` styrer
  // fold-ud-kortets tekst ("i gang" vs. "afgjort").
  const { liveStage, liveStageDone } = useMemo(() => {
    const now = Date.now();
    const s = stages.find((st) => {
      const status = stageStatus(st, now);
      return (status === 'locked' || status === 'done') && isTodayInCopenhagen(st.kickoff);
    }) || null;
    return { liveStage: s, liveStageDone: s ? stageStatus(s, now) === 'done' : false };
  }, [stages]);

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

      {/* Dansk live-dækning fra letour.fr, mens etapen kører */}
      <LiveTicker stage={liveStage} enabled={!!liveStage} />

      {/* Alles tips DIREKTE på forsiden fra etapestart — fold ud, færdig.
          (Reglerne åbner læsning af andres tips ved kickoff.) */}
      {liveStage && (
        <details
          className="card"
          style={{ marginBottom: '1rem' }}
          data-testid="live-answers"
          onToggle={(e) => setAnswersOpen(e.currentTarget.open)}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>
              {liveStageDone
                ? `🏁 Etape ${liveStage.number} er afgjort — se resultatet og alles tips`
                : `👀 Etape ${liveStage.number} er i gang — se hvad de andre har tippet`}
            </span>
            <span className="badge badge--blue">{answersOpen ? 'fold sammen' : 'fold ud'}</span>
          </summary>
          {answersOpen && (
            <div style={{ marginTop: '0.75rem' }}>
              <StageAnswers stage={liveStage} points={stagePoints} gcTopN={gcTopN} />
            </div>
          )}
        </details>
      )}

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

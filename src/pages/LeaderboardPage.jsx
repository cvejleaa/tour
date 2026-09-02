/**
 * LeaderboardPage – rangering med to faner:
 *   1. "Samlet stilling" – alle godkendte spillere, live via onSnapshot.
 *   2. "Dagens etape"    – point kun fra dagens afgjorte etaper.
 *
 * Har en dropdown til at filtrere til én af brugerens egne ligaer.
 */
import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStandings } from '../features/leaderboard/useStandings';
import { useDailyStandings } from '../features/leaderboard/useDailyStandings';
import { useLeagues } from '../features/leagues/useLeagues';
import { collectVisibleUids } from '../features/leaderboard/standingsUtils';
import StandingsTable from '../features/leaderboard/StandingsTable';
import BreakdownTable from '../features/leaderboard/BreakdownTable';
import { useStandingsBreakdown } from '../features/leaderboard/useStandingsBreakdown';
import { useStages } from '../features/stages/useStages';
import { useActiveSeason } from '../features/stages/useActiveSeason';
import { useTourSettings } from '../features/stages/useTourSettings';
import { leagueScore, scoringLabel, normalizeScoring, isFullScoring } from '../features/leagues/leagueFormat';
import { useLeagueBonus } from '../features/leagues/useLeagueBonus';
import { useLeagueAwards } from '../features/leagues/useLeagueAwards';

// ── Fane-konstanter ──────────────────────────────────────────────────────────
const TAB_OVERALL = 'overall';
const TAB_DAILY = 'daily';
const TAB_BREAKDOWN = 'breakdown';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(TAB_OVERALL);
  const [selectedLeagueId, setSelectedLeagueId] = useState(''); // '' = alle

  // Hooks
  const { standings, loading: loadingStandings, error: errorStandings } = useStandings();
  const { pointsByUid, todayStr, loading: loadingDaily, error: errorDaily } = useDailyStandings();
  const { leagues } = useLeagues(user?.uid);

  // Udspecificeret: point pr. spørgsmål — hentes/beregnes først når fanen åbnes.
  const season = useActiveSeason();
  const { points: stagePointsCfg } = useTourSettings();
  const { stages } = useStages(season);
  const { byUid: breakdownByUid, loading: loadingBreakdown } = useStandingsBreakdown(
    stages, stagePointsCfg, activeTab === TAB_BREAKDOWN,
  );

  // Find de valgte ligamedlemmer (til filter)
  const selectedLeague = leagues.find((l) => l.id === selectedLeagueId) ?? null;

  // Man må kun se spillere, der deler mindst én liga med en selv (+ sig selv).
  // Når en liga er valgt: kun den ligas medlemmer. Ellers: hele ens liga-netværk.
  const visibleUids = useMemo(
    () => collectVisibleUids(leagues, user?.uid),
    [leagues, user?.uid],
  );
  const memberUids = selectedLeague ? selectedLeague.memberUids ?? [] : visibleUids;

  // getPoints-funktion til dagsfanen
  const getDailyPoints = useCallback(
    (uid) => pointsByUid[uid] ?? 0,
    [pointsByUid],
  );

  // Når en liga er valgt, rangeres efter dens scoring-valg — inkl. liga-bonus,
  // så forsidens filter matcher ligaens egen side præcist.
  const leagueScoring = normalizeScoring(selectedLeague);
  const { pointsByUid: leagueBonusByUid } = useLeagueBonus(selectedLeagueId || null, user?.uid);
  // Manuelle liga-point på fælles bonusspørgsmål tæller sammen med liga-bonus.
  const { awardsByUid: leagueAwardsByUid } = useLeagueAwards(selectedLeagueId || null);
  const getLeaguePoints = useCallback(
    (uid) => leagueScore(
      standings.find((u) => u.uid === uid),
      leagueScoring,
      (leagueBonusByUid[uid] || 0) + (leagueAwardsByUid[uid] || 0),
    ),
    [standings, leagueScoring, leagueBonusByUid, leagueAwardsByUid],
  );
  // Brug liga-scoring når en liga er valgt (også ved fuld scoring, så liga-bonus tæller med)
  const useLeagueScoring = !!selectedLeagueId;
  const showScoringNote = selectedLeagueId && !isFullScoring(leagueScoring);

  // Formatér dags dato til dansk visning
  const todayDanish = todayStr
    ? new Date(todayStr).toLocaleDateString('da-DK', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : '';

  const error = activeTab === TAB_DAILY ? errorDaily : errorStandings;

  return (
    <div>
      {/* Sideoverskrift */}
      <div className="flex items-center justify-between mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--c-text)' }}>
          🏆 Stilling
        </h1>
      </div>

      {/* Liga-filter */}
      {leagues.length > 0 && (
        <div className="form-group mb-2" style={{ maxWidth: 280 }}>
          <label className="form-label" htmlFor="league-filter">Filtrer efter liga</label>
          <select
            id="league-filter"
            className="select"
            value={selectedLeagueId}
            onChange={(e) => setSelectedLeagueId(e.target.value)}
          >
            <option value="">— Alle spillere —</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name || 'Liga uden navn'}</option>
            ))}
          </select>
        </div>
      )}

      {/* Fanelinje */}
      <div className="tabs" role="tablist">
        <button
          role="tab"
          className={`tab${activeTab === TAB_OVERALL ? ' tab--active' : ''}`}
          aria-selected={activeTab === TAB_OVERALL}
          onClick={() => setActiveTab(TAB_OVERALL)}
        >
          📊 Samlet stilling
        </button>
        <button
          role="tab"
          className={`tab${activeTab === TAB_DAILY ? ' tab--active' : ''}`}
          aria-selected={activeTab === TAB_DAILY}
          onClick={() => setActiveTab(TAB_DAILY)}
        >
          📅 Dagens etape
        </button>
        <button
          role="tab"
          className={`tab${activeTab === TAB_BREAKDOWN ? ' tab--active' : ''}`}
          aria-selected={activeTab === TAB_BREAKDOWN}
          onClick={() => setActiveTab(TAB_BREAKDOWN)}
        >
          🧮 Udspecificeret
        </button>
      </div>

      {/* Fejlbesked */}
      {error && (
        <p className="badge badge--red mb-2" role="alert">{error}</p>
      )}

      {/* ── Samlet stilling ────────────────────────────────────────────── */}
      {activeTab === TAB_OVERALL && (
        <div className="card card--flat">
          <div className="card__header">
            <h2 className="card__title">
              {selectedLeague ? `${selectedLeague.name} – stilling` : 'Samlet stilling'}
            </h2>
            {selectedLeagueId && (
              <span className="badge badge--blue">
                {selectedLeague?.memberUids?.length ?? 0} spillere
              </span>
            )}
          </div>

          {showScoringNote && (
            <p className="text-sm text-muted mb-2" style={{ color: 'var(--c-muted)' }}>
              Rangeret efter ligaens format: <strong>{scoringLabel(leagueScoring)}</strong>
            </p>
          )}

          <StandingsTable
            users={standings}
            meUid={user?.uid}
            memberUids={memberUids}
            getPoints={useLeagueScoring ? getLeaguePoints : null}
            loading={loadingStandings}
            showMovement={!selectedLeagueId}
            emptyMsg="Ingen godkendte spillere endnu."
          />
        </div>
      )}

      {/* ── Dagens etape ──────────────────────────────────────────────── */}
      {activeTab === TAB_DAILY && (
        <div className="card card--flat">
          <div className="card__header">
            <h2 className="card__title">
              {selectedLeague ? `${selectedLeague.name} – i dag` : 'Dagens point'}
            </h2>
            {todayDanish && (
              <span className="badge badge--muted" style={{ textTransform: 'capitalize' }}>
                {todayDanish}
              </span>
            )}
          </div>

          {!loadingDaily && Object.keys(pointsByUid).length === 0 && (
            <p className="text-muted text-sm mb-2">
              Ingen afgjorte etaper i dag endnu — point opdateres løbende.
            </p>
          )}

          <StandingsTable
            users={standings}
            meUid={user?.uid}
            memberUids={memberUids}
            getPoints={getDailyPoints}
            loading={loadingDaily || loadingStandings}
            emptyMsg="Ingen point fra dagens etape endnu."
          />
        </div>
      )}

      {/* ── Udspecificeret (Q1-4 + bonus + total) ─────────────────────── */}
      {activeTab === TAB_BREAKDOWN && (
        <div className="card card--flat">
          <div className="card__header">
            <h2 className="card__title">
              {selectedLeague ? `${selectedLeague.name} – udspecificeret` : 'Udspecificeret stilling'}
            </h2>
          </div>
          <p className="text-sm mb-2" style={{ color: 'var(--c-muted)', fontSize: '0.82rem' }}>
            Point pr. spørgsmål på tværs af alle afgjorte etaper:
            🏆 etapevinderens hold · ⏱️ bedste hold · ⛰️ flest bjergpoint · 🚀 flest sprintpoint
            · 🎁 bonusspørgsmål. Rød parentes i Total = straf for utippede etaper.
          </p>
          <BreakdownTable
            users={standings}
            byUid={breakdownByUid}
            meUid={user?.uid}
            memberUids={memberUids}
            loading={loadingBreakdown || loadingStandings}
          />
        </div>
      )}
    </div>
  );
}

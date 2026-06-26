/**
 * LeaderboardPage – rangering med to faner:
 *   1. "Samlet stilling" – alle godkendte spillere, live via onSnapshot.
 *   2. "Dagens kampe"   – point kun fra dagens finished matches.
 *
 * Har en dropdown til at filtrere til én af brugerens egne ligaer.
 */
import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStandings } from '../features/leaderboard/useStandings';
import { useDailyStandings } from '../features/leaderboard/useDailyStandings';
import { useLeagues } from '../features/leagues/useLeagues';
import { useMatches } from '../features/matches/useMatches';
import { useTipParticipation } from '../features/leagues/useTipParticipation';
import { collectVisibleUids, tippedFinishedCounts } from '../features/leaderboard/standingsUtils';
import StandingsTable from '../features/leaderboard/StandingsTable';
import SharpStandings from '../features/leaderboard/SharpStandings';
import ThemeToggle from '../features/leaderboard/ThemeToggle';
import { leagueScore, scoringLabel, normalizeScoring, isFullScoring } from '../features/leagues/leagueFormat';
import { useLeagueBonus } from '../features/leagues/useLeagueBonus';

// ── Fane-konstanter ──────────────────────────────────────────────────────────
const TAB_OVERALL = 'overall';
const TAB_DAILY = 'daily';
const TAB_SHARP = 'sharp';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(TAB_OVERALL);
  const [selectedLeagueId, setSelectedLeagueId] = useState(''); // '' = alle
  const [sortMode, setSortMode] = useState('total'); // 'total' | 'avg' (samlet stilling)

  // Hooks
  const { standings, loading: loadingStandings, error: errorStandings } = useStandings();
  const { pointsByUid, todayStr, loading: loadingDaily, error: errorDaily } = useDailyStandings();
  const { leagues } = useLeagues(user?.uid);

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

  // Antal tippede (afsluttede) kampe pr. spiller → gns. point pr. tippet kamp.
  const { matches: allMatches } = useMatches();
  const { byMatch: tipByMatch } = useTipParticipation();
  const tippedByUid = useMemo(
    () => tippedFinishedCounts(allMatches, tipByMatch),
    [allMatches, tipByMatch],
  );
  const getTipped = useCallback((uid) => tippedByUid[uid] ?? 0, [tippedByUid]);

  // Når en liga er valgt, rangeres efter dens scoring-valg — inkl. liga-bonus,
  // så forsidens filter matcher ligaens egen side præcist.
  const leagueScoring = normalizeScoring(selectedLeague);
  const { pointsByUid: leagueBonusByUid } = useLeagueBonus(selectedLeagueId || null, user?.uid);
  const getLeaguePoints = useCallback(
    (uid) => leagueScore(standings.find((u) => u.uid === uid), leagueScoring, leagueBonusByUid[uid] || 0),
    [standings, leagueScoring, leagueBonusByUid],
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
        <ThemeToggle />
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
              <option key={l.id} value={l.id}>{l.name}</option>
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
          📅 Dagens kampe
        </button>
        <button
          role="tab"
          className={`tab${activeTab === TAB_SHARP ? ' tab--active' : ''}`}
          aria-selected={activeTab === TAB_SHARP}
          onClick={() => setActiveTab(TAB_SHARP)}
        >
          🎯 Skarpskytten
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

          {/* Sortér: total eller gns. point pr. tippet kamp */}
          <div className="flex items-center gap-1 mb-2" style={{ fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--c-muted)' }}>Sortér efter:</span>
            <button
              className={`btn btn--sm${sortMode === 'total' ? '' : ' btn--ghost'}`}
              onClick={() => setSortMode('total')}
              aria-pressed={sortMode === 'total'}
            >
              Total
            </button>
            <button
              className={`btn btn--sm${sortMode === 'avg' ? '' : ' btn--ghost'}`}
              onClick={() => setSortMode('avg')}
              aria-pressed={sortMode === 'avg'}
            >
              Gns.
            </button>
          </div>

          <StandingsTable
            users={standings}
            meUid={user?.uid}
            memberUids={memberUids}
            getPoints={useLeagueScoring ? getLeaguePoints : null}
            loading={loadingStandings}
            showMovement={!selectedLeagueId && sortMode === 'total'}
            showAvg
            getTipped={getTipped}
            sortMode={sortMode}
            showBreakdown={!useLeagueScoring}
            emptyMsg="Ingen godkendte spillere endnu."
          />
        </div>
      )}

      {/* ── Dagens kampe ──────────────────────────────────────────────── */}
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
              Ingen afsluttede kampe i dag endnu — point opdateres løbende.
            </p>
          )}

          <StandingsTable
            users={standings}
            meUid={user?.uid}
            memberUids={memberUids}
            getPoints={getDailyPoints}
            loading={loadingDaily || loadingStandings}
            emptyMsg="Ingen point fra dagens kampe endnu."
          />
        </div>
      )}

      {/* ── 🎯 Skarpskytten ───────────────────────────────────────────── */}
      {activeTab === TAB_SHARP && (
        <SharpStandings meUid={user?.uid} memberUids={memberUids} />
      )}
    </div>
  );
}

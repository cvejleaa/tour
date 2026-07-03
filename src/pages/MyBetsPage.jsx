// ---------------------------------------------------------------------------
// MyBetsPage – overblik over brugerens egne etape-tip.
// Viser alle tippede etaper, status, optjente point og samlet sum.
// Giver mulighed for at hoppe til redigering af ulåste tips.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStages } from '../features/stages/useStages';
import { useMyStageBets } from '../features/stages/useMyStageBets';
import { useActiveSeason } from '../features/stages/useActiveSeason';
import { useTourSettings } from '../features/stages/useTourSettings';
import { stageStatus } from '../lib/tourStages';
import { scoreStageBet, STAGE_FIELDS } from '../lib/tourScoring';
import { prettyTeam } from '../data/tourTeams2026';

/** Hjælper: statuslabel og badge-farve for et etape-tip. */
function betStatus(status) {
  if (status === 'done') return { label: 'Afgjort', cls: 'badge--green' };
  if (status === 'locked') return { label: 'Låst', cls: 'badge--red' };
  return { label: 'Afventer', cls: 'badge--blue' };
}

export default function MyBetsPage() {
  const { user } = useAuth();
  const season = useActiveSeason();
  const { stages, loading: stagesLoading } = useStages(season);
  const { betsByStage, loading: betsLoading } = useMyStageBets(user?.uid ?? null, season);
  const { points } = useTourSettings();

  const isLoading = stagesLoading || betsLoading;

  // Filtrér til kun etaper brugeren har tippet (mindst ét holdvalg)
  const tippedStages = useMemo(
    () => stages.filter((s) => STAGE_FIELDS.some(({ key }) => betsByStage[s.id]?.[key])),
    [stages, betsByStage],
  );

  // Beregn point for afgjorte etaper
  const pointsPerStage = useMemo(() => {
    const map = new Map();
    for (const s of tippedStages) {
      if (stageStatus(s, Date.now()) !== 'done' || !s.result) {
        map.set(s.id, null);
        continue;
      }
      map.set(s.id, scoreStageBet(betsByStage[s.id], s.result, points, s).points);
    }
    return map;
  }, [tippedStages, betsByStage, points]);

  // Samlet sum af kendte point
  const totalPoints = useMemo(() => {
    let sum = 0;
    pointsPerStage.forEach((pts) => {
      if (pts !== null) sum += pts;
    });
    return sum;
  }, [pointsPerStage]);

  // Antal ulåste etaper der kan redigeres
  const editableCount = tippedStages.filter((s) => stageStatus(s, Date.now()) === 'scheduled').length;

  if (isLoading) {
    return (
      <div className="container">
        <div className="spinner" aria-label="Henter tips…" />
      </div>
    );
  }

  return (
    <div className="container">
      {/* Overskrift */}
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem' }}>📋 Mine tips</h1>
        <p style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.88rem' }}>
          Dine afgivne etape-tip og optjente point.
        </p>
      </div>

      {/* Summarisk statistik */}
      <div
        className="card"
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-pitch)' }}
            data-testid="total-points"
          >
            {totalPoints}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Point i alt
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-text)' }}>
            {tippedStages.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Tippede etaper
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-warn)' }}>
            {editableCount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Kan redigeres
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link to="/etaper" className="btn btn--ghost btn--sm">
            🚴 Til etaperne
          </Link>
        </div>
      </div>

      {/* Tom tilstand */}
      {tippedStages.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🎯</div>
          <div className="empty-state__title">Ingen tips endnu</div>
          <p>Gå til etapesiden for at afgive dine første tips.</p>
          <Link to="/etaper" className="btn" style={{ marginTop: '0.75rem' }}>
            Gå til etaper
          </Link>
        </div>
      )}

      {/* Tippede etaper */}
      {tippedStages.length > 0 && (
        <div className="card card--flat" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Etape</th>
                  <th>Etapevinder</th>
                  <th>Bedste hold</th>
                  <th>Bjerg</th>
                  <th>Sprint</th>
                  <th>Point</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tippedStages.map((stage) => {
                  const bet = betsByStage[stage.id];
                  const status = stageStatus(stage, Date.now());
                  const locked = status !== 'scheduled';
                  const pts = pointsPerStage.get(stage.id);
                  const { label: statusLabel, cls: statusCls } = betStatus(status);

                  return (
                    <tr key={stage.id}>
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Etape {stage.number}</td>
                      <td>{prettyTeam(bet?.winnerTeam) || '–'}</td>
                      <td>{prettyTeam(bet?.gcTeam) || '–'}</td>
                      <td>{prettyTeam(bet?.mountainTeam) || '–'}</td>
                      <td>{prettyTeam(bet?.sprintTeam) || '–'}</td>
                      <td>
                        {pts !== null ? (
                          <span className={`badge ${pts > 0 ? 'badge--green' : 'badge--muted'}`}>
                            {pts > 0 ? `+${pts}` : String(pts)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--c-muted)' }}>–</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${statusCls}`}>{statusLabel}</span>
                      </td>
                      <td>
                        {!locked && (
                          <Link
                            to="/etaper"
                            className="btn btn--ghost btn--sm"
                            title="Rediger tip"
                          >
                            ✏️
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

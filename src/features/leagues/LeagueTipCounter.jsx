/**
 * LeagueTipCounter — viser pr. kommende etape hvor mange af ligaens medlemmer
 * der har tippet, og hvem der mangler. Afslører ikke selve tippene.
 */
import { useState } from 'react';
import { useStages } from '../stages/useStages';
import { useActiveSeason } from '../stages/useActiveSeason';
import { useTipParticipation, leagueTipStatus } from './useTipParticipation';
import { stageStatus } from '../../lib/tourStages';

const STAGE_TYPE_LABEL = {
  flat: '🟢 Flad', hilly: '🟡 Kuperet', mountain: '🔴 Bjerg',
  itt: '⏱️ Enkeltstart', ttt: '⏱️ Holdtidskørsel', unknown: 'Etape',
};

function formatDate(kickoff) {
  if (!kickoff) return '';
  const d = kickoff?.toDate ? kickoff.toDate() : new Date(kickoff);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function LeagueTipCounter({ members }) {
  const season = useActiveSeason();
  const { stages, loading: loadingStages } = useStages(season);
  const { byMatch: byStage, loading: loadingPart } = useTipParticipation();
  const [expanded, setExpanded] = useState(null);
  const [showAll, setShowAll] = useState(false);

  if (loadingStages || loadingPart) {
    return <div className="spinner" role="status" aria-label="Indlæser" />;
  }

  // Kun etaper hvor tip stadig er åbent
  const upcoming = stages.filter((s) => stageStatus(s, Date.now()) === 'scheduled');

  if (upcoming.length === 0) {
    return (
      <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>
        Ingen kommende etaper at tippe på lige nu.
      </p>
    );
  }

  const shown = showAll ? upcoming : upcoming.slice(0, 8);

  return (
    <div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {shown.map((s) => {
          const { tipped, total, missing } = leagueTipStatus(byStage.get(s.id), members);
          const allTipped = total > 0 && tipped === total;
          const isOpen = expanded === s.id;
          return (
            <li
              key={s.id}
              data-testid="league-tip-row"
              style={{ borderBottom: '1px solid var(--c-border)', paddingBottom: '0.5rem' }}
            >
              <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)' }}>
                    {formatDate(s.kickoff)}
                  </span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    Etape {s.number}
                    <span style={{ fontWeight: 400, color: 'var(--c-muted)', marginLeft: '0.4rem', fontSize: '0.82rem' }}>
                      {STAGE_TYPE_LABEL[s.type] || ''}
                    </span>
                  </span>
                </div>
                <button
                  className={`badge ${allTipped ? 'badge--green' : 'badge--yellow'}`}
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  style={{ cursor: 'pointer', border: 'none' }}
                  data-testid="league-tip-badge"
                  aria-expanded={isOpen}
                  title={allTipped ? 'Alle har tippet' : 'Klik for at se hvem der mangler'}
                >
                  {tipped}/{total} har tippet {allTipped ? '✓' : missing.length > 0 ? '▾' : ''}
                </button>
              </div>

              {isOpen && !allTipped && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--c-muted)' }}>Mangler at tippe: </span>
                  {missing.length === 0 ? (
                    <span>ingen 🎉</span>
                  ) : (
                    missing.map((u) => (
                      <span key={u.uid} className="badge badge--muted" style={{ margin: '0 0.2rem 0.2rem 0' }}>
                        {u.displayName || '(ukendt)'}
                      </span>
                    ))
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {upcoming.length > 8 && (
        <button className="btn btn--ghost btn--sm mt-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Vis færre' : `Vis alle ${upcoming.length} kommende etaper`}
        </button>
      )}
    </div>
  );
}

/**
 * LeagueTipCounter — viser pr. kommende kamp hvor mange af ligaens medlemmer
 * der har tippet, og hvem der mangler. Afslører ikke selve tippene.
 */
import { useState } from 'react';
import { useMatches } from '../matches/useMatches';
import { useTipParticipation, leagueTipStatus } from './useTipParticipation';
import { isMatchLocked, formatKickoffTime, dayKey } from '../matches/matchHelpers';
import { teamName, flagUrl } from '../../lib/teams';

function TeamLabel({ code }) {
  if (!code) return <span style={{ color: 'var(--c-muted)' }}>?</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      <img src={flagUrl(code, 20)} alt="" width={20} height={15} style={{ borderRadius: 2 }} />
      {teamName(code)}
    </span>
  );
}

export default function LeagueTipCounter({ members }) {
  const { matches, loading: loadingMatches } = useMatches();
  const { byMatch, loading: loadingPart } = useTipParticipation();
  const [expanded, setExpanded] = useState(null);
  const [showAll, setShowAll] = useState(false);

  if (loadingMatches || loadingPart) {
    return <div className="spinner" role="status" aria-label="Indlæser" />;
  }

  // Kun kampe der endnu ikke er kickoff'et og har kendte hold
  const now = new Date();
  const upcoming = matches.filter(
    (m) => m.homeTeam && m.awayTeam && !isMatchLocked(m.kickoff, now),
  );

  if (upcoming.length === 0) {
    return (
      <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>
        Ingen kommende kampe at tippe på lige nu.
      </p>
    );
  }

  const shown = showAll ? upcoming : upcoming.slice(0, 8);

  return (
    <div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {shown.map((m) => {
          const { tipped, total, missing } = leagueTipStatus(byMatch.get(m.id), members);
          const allTipped = total > 0 && tipped === total;
          const isOpen = expanded === m.id;
          return (
            <li
              key={m.id}
              data-testid="league-tip-row"
              style={{ borderBottom: '1px solid var(--c-border)', paddingBottom: '0.5rem' }}
            >
              <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)' }}>
                    {dayKey(m.kickoff)} · {formatKickoffTime(m.kickoff)}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                    <TeamLabel code={m.homeTeam} /> <span style={{ color: 'var(--c-muted)' }}>–</span> <TeamLabel code={m.awayTeam} />
                  </span>
                </div>
                <button
                  className={`badge ${allTipped ? 'badge--green' : 'badge--yellow'}`}
                  onClick={() => setExpanded(isOpen ? null : m.id)}
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
          {showAll ? 'Vis færre' : `Vis alle ${upcoming.length} kommende kampe`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GameCompetitions – spillets fire konkurrencer som hold-stillinger (top-5),
// hver med en specifikation af hvilke ryttere der udgør holdets resultat.
// Det er præcis de fire ting man tipper: etapevinder-hold, bedste hold,
// flest bjergpoint, flest sprintpoint.
// ---------------------------------------------------------------------------
import TeamBadge from '../../components/TeamBadge';
import { canonicalTeamKey } from '../../lib/tourTeams';
import { DEFAULT_GC_TOP_N } from '../../lib/tourScoring';
import { gameCompetitions } from './gameCompetitions';

const MEDAL = ['🥇', '🥈', '🥉'];

function ridersLine(riders, kind) {
  if (!riders || riders.length === 0) return null;
  return riders
    .map((r) => (kind === 'pts' ? `${r.rider} ${r.points}p` : `${r.rider} (${r.rank}.)`))
    .join(' · ');
}

export default function GameCompetitions({ data, gcTopN = DEFAULT_GC_TOP_N, highlightTeams = null, only = null }) {
  const comps = gameCompetitions(data, gcTopN);
  const ALL = [
    { key: 'winnerTeam', icon: '🏆', label: 'Etapevinderens hold', kind: 'pos' },
    { key: 'gcTeam', icon: '⏱️', label: `Bedste hold (de første ${gcTopN} ryttere)`, kind: 'sum', note: 'Sum af holdets N bedste placeringer — lavest vinder' },
    { key: 'mountainTeam', icon: '⛰️', label: 'Flest bjergpoint', kind: 'pts' },
    { key: 'sprintTeam', icon: '🚀', label: 'Flest sprintpoint', kind: 'pts' },
  ];
  // `only` begrænser til udvalgte konkurrencer (fx kun hold-baserede på etapesiden).
  const CONFIG = only ? ALL.filter((c) => only.includes(c.key)) : ALL;

  const valueOf = (c, t) => {
    if (c.kind === 'pos') return `#${t.best}`;
    if (c.kind === 'sum') return `Σ ${t.sum}`;
    return `${t.total} p`;
  };

  return (
    <section style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }} data-testid="game-competitions">
      {CONFIG.map((c) => {
        const teams = comps[c.key] || [];
        return (
          <div key={c.key} className="card" data-testid={`gamecomp-${c.key}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: c.note ? '0.1rem' : '0.5rem' }}>
              <span aria-hidden>{c.icon}</span>
              <strong style={{ fontSize: '0.98rem' }}>{c.label}</strong>
            </div>
            {c.note && (
              <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>{c.note}</div>
            )}
            {teams.length === 0 ? (
              <p style={{ fontSize: '0.83rem', color: 'var(--c-muted)', margin: 0 }}>Ingen data endnu.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.35rem' }}>
                {teams.map((t, i) => {
                  const tipped = !!(highlightTeams && highlightTeams.has(canonicalTeamKey(t.team)));
                  const line = ridersLine(t.riders, c.kind);
                  return (
                    <li
                      key={t.team}
                      data-testid="gamecomp-team"
                      data-tipped={tipped ? 'true' : undefined}
                      style={{
                        padding: '0.35rem 0.45rem', borderRadius: 8,
                        background: tipped ? 'rgba(11,110,79,0.10)' : (i === 0 ? 'var(--c-surface-alt, #f6faf8)' : 'transparent'),
                        borderLeft: tipped ? '3px solid var(--c-pitch)' : (i === 0 ? '3px solid var(--c-pitch)' : '3px solid transparent'),
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 24, textAlign: 'center' }}>{MEDAL[i] || (i + 1)}</span>
                        <span style={{ fontWeight: i === 0 ? 800 : 600, flex: 1, minWidth: 0 }}>
                          {tipped && <span title="Tippet hold" aria-label="Tippet hold">⭐ </span>}
                          <TeamBadge name={t.team} />
                        </span>
                        <span style={{ marginLeft: 'auto', fontWeight: 700, whiteSpace: 'nowrap' }}>{valueOf(c, t)}</span>
                      </div>
                      {line && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--c-muted)', paddingLeft: '2rem', marginTop: '0.1rem' }}>
                          {line}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

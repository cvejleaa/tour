// ---------------------------------------------------------------------------
// StandingsTable – én konkurrences stilling (rank · rytter/hold · hold · værdi).
// Viser top N med en "vis alle"-knap. `valueType` vælger hvilken kolonne der er
// den primære værdi (tid for GC/ungdom/hold, point for sprint/bjerg).
// ---------------------------------------------------------------------------
import { useState } from 'react';
import TeamBadge from '../../components/TeamBadge';
import { canonicalTeamKey } from '../../lib/tourTeams';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function StandingsTable({
  rows = [], valueType = 'time', teamsMode = false, topN = 10, accent = 'var(--c-pitch)',
  flagFor = null, highlightTeams = null, danishFor = null, riderNameFor = null,
}) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return <p style={{ fontSize: '0.84rem', color: 'var(--c-muted)', margin: '0.3rem 0 0' }}>Ingen data endnu.</p>;
  }
  const shown = open ? list : list.slice(0, topN);

  const valueOf = (r) => {
    if (valueType === 'points') return r.points != null ? `${r.points} p` : '';
    return r.time || '';
  };

  return (
    <div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.15rem' }}>
        {shown.map((r, i) => {
          const rank = Number.isFinite(Number(r.rank)) ? Number(r.rank) : i + 1;
          const isTop = rank <= 3;
          // Danskere markeres altid med Dannebrog + rød fremhævning — også
          // uden for UCI-flagdatasættet. Tip-fremhævning (grøn) vinder ved
          // sammenfald, så betydningen af farverne er entydig.
          const danish = !!(danishFor && r.rider && danishFor(r.rider));
          const flag = danish ? '🇩🇰' : (flagFor && r.rider ? flagFor(r.rider) : '');
          const tipped = !!(highlightTeams && r.team && highlightTeams.has(canonicalTeamKey(r.team)));
          return (
            <li
              key={`${rank}-${r.rider || r.team || i}`}
              data-testid="standings-row"
              data-tipped={tipped ? 'true' : undefined}
              data-danish={danish ? 'true' : undefined}
              title={tipped ? 'Tippet hold' : (danish ? 'Dansk rytter' : undefined)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem',
                padding: '0.3rem 0.4rem', borderRadius: 8,
                background: tipped ? 'rgba(11,110,79,0.10)'
                  : danish ? 'rgba(198,12,48,0.07)'
                    : (isTop ? 'var(--c-surface-alt, #f6faf8)' : 'transparent'),
                borderLeft: tipped ? '3px solid var(--c-pitch)'
                  : danish ? '3px solid #c8102e'
                    : (rank === 1 ? `3px solid ${accent}` : '3px solid transparent'),
              }}
            >
              <span style={{ width: 26, textAlign: 'center', fontWeight: 700, color: 'var(--c-muted)' }}>
                {MEDAL[rank - 1] || rank}
              </span>
              {teamsMode ? (
                <span style={{ fontWeight: isTop ? 700 : 600, flex: 1, minWidth: 0 }}>
                  {tipped && <span aria-label="Tippet hold" title="Tippet hold">⭐ </span>}
                  <TeamBadge name={r.team} />
                </span>
              ) : (
                <>
                  {flag && <span aria-hidden style={{ flexShrink: 0 }}>{flag}</span>}
                  <span style={{ fontWeight: (isTop || danish) ? 700 : 600, flex: 1, minWidth: 0 }}>
                    {(riderNameFor && r.rider ? riderNameFor(r.rider) : r.rider) || '—'}
                  </span>
                  {tipped && <span aria-label="Tippet hold" title="Tippet hold" style={{ flexShrink: 0 }}>⭐</span>}
                  {r.team && (
                    <span style={{ flexShrink: 0 }}><TeamBadge name={r.team} size={16} /></span>
                  )}
                </>
              )}
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--c-text)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {valueOf(r)}
              </span>
            </li>
          );
        })}
      </ul>
      {list.length > topN && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setOpen((v) => !v)}
          data-testid="standings-toggle"
          style={{ marginTop: '0.4rem' }}
        >
          {open ? `Vis top ${topN}` : `Vis alle (${list.length})`}
        </button>
      )}
    </div>
  );
}

// Disciplin-statistik — flest kort (gule/røde) pr. hold og spiller.
// Bygger på kampdetaljer (match.details.bookings) hentet fra football-data.org.
import { useState } from 'react';
import { computeDiscipline } from './statsUtils';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';

function Cards({ yellow, red }) {
  return (
    <span style={{ display: 'inline-flex', gap: '0.4rem', fontVariantNumeric: 'tabular-nums' }}>
      {yellow > 0 && <span title="gule kort">🟨 {yellow}</span>}
      {red > 0 && <span title="røde kort">🟥 {red}</span>}
      {yellow === 0 && red === 0 && <span style={{ color: 'var(--c-muted)' }}>0</span>}
    </span>
  );
}

export default function DisciplineCard({ matches, limit = 5 }) {
  const { teams, players, totals, allTeams } = computeDiscipline(matches);
  const [showAll, setShowAll] = useState(false);

  // Vis intet før der er kort (fx før turneringen).
  if (totals.yellow === 0 && totals.red === 0) return null;

  const teamRows = showAll ? allTeams : teams.slice(0, limit);

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>🟨 Disciplin</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.5rem' }}>
        I alt {totals.yellow} gule og {totals.red} røde kort.
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              {showAll ? `Nationer (${allTeams.length})` : 'Hold'}
            </span>
            {allTeams.length > limit && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="btn btn--ghost btn--sm"
                style={{ fontSize: '0.75rem' }}
              >
                {showAll ? `Vis top ${limit}` : 'Vis alle nationer'}
              </button>
            )}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {teamRows.map((t) => (
              <li key={t.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', fontSize: '0.85rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Flag code={t.code} size={18} /> {teamName(t.code)}
                </span>
                <Cards yellow={t.yellow} red={t.red} />
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Spillere</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {players.slice(0, limit).map((p) => (
              <li key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', fontSize: '0.85rem' }}>
                <span style={{ minWidth: 0 }}>
                  {p.name}
                  {p.team && <span style={{ color: 'var(--c-muted)' }}> · {teamName(p.team)}</span>}
                </span>
                <Cards yellow={p.yellow} red={p.red} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

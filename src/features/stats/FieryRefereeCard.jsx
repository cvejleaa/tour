// Disciplin-udvidelse: hidsigste kampe (flest kort) og dommerstatistik.
import { computeFieryMatches, computeRefereeStats } from './statsUtils';
import { teamName } from '../../lib/teams';

function Cards({ yellow, red }) {
  return (
    <span style={{ display: 'inline-flex', gap: '0.4rem', fontVariantNumeric: 'tabular-nums' }}>
      {yellow > 0 && <span title="gule kort">🟨 {yellow}</span>}
      {red > 0 && <span title="røde kort">🟥 {red}</span>}
    </span>
  );
}

export default function FieryRefereeCard({ matches, limit = 5 }) {
  const fiery = computeFieryMatches(matches, limit);
  const refs = computeRefereeStats(matches);
  if (fiery.length === 0 && refs.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>🔥 Hidsigste kampe & dommere</h2>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
        {fiery.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Flest kort</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {fiery.map(({ match, yellow, red }) => (
                <li key={match.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', fontSize: '0.85rem' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {teamName(match.homeTeam)}–{teamName(match.awayTeam)}
                  </span>
                  <Cards yellow={yellow} red={red} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {refs.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>Dommere</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {refs.slice(0, limit).map((r) => (
                <li key={r.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', fontSize: '0.85rem' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name} <span style={{ color: 'var(--c-muted)' }}>· {r.matches} kamp{r.matches === 1 ? '' : 'e'}</span>
                  </span>
                  <Cards yellow={r.yellow} red={r.red} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

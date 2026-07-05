// ---------------------------------------------------------------------------
// TourRiderSearch – søgefelt på Tour-siden: find en rytter og se hans
// placering i ALLE stillinger (samlet/point/bjerg/ungdom + seneste etape)
// på én gang. Samme udtryk som holdsidens rytter-søgning.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import TeamBadge from '../../components/TeamBadge';
import { riderFlag } from '../../data/uciRanking2026';
import { isDanishRider } from '../../data/ridersTdf2026';
import { searchTourStandings, SEARCH_COMPS } from './tourRiderSearch';

function PlaceChip({ icon, label, place }) {
  if (!place) {
    return (
      <span className="badge badge--muted" style={{ fontSize: '0.7rem', opacity: 0.55 }} title={`${label}: ikke placeret`}>
        {icon} —
      </span>
    );
  }
  const value = place.points != null ? `${place.points} p` : (place.time || '');
  return (
    <span className="badge badge--muted" style={{ fontSize: '0.7rem' }} title={label}>
      {icon} #{place.rank}{value ? ` · ${value}` : ''}
    </span>
  );
}

export default function TourRiderSearch({ standings, stageResult }) {
  const [q, setQ] = useState('');
  const active = q.trim().length >= 2;
  const results = useMemo(
    () => (active ? searchTourStandings(standings, stageResult, q) : []),
    [standings, stageResult, q, active],
  );

  return (
    <div style={{ marginTop: '0.9rem' }}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Søg efter en rytter i alle stillinger…"
        aria-label="Søg efter en rytter i alle stillinger"
        data-testid="tour-rider-search-input"
        style={{
          width: '100%', padding: '0.6rem 0.85rem', borderRadius: 10,
          border: '1px solid var(--c-border)', fontSize: '0.95rem',
          background: 'var(--c-surface)', color: 'var(--c-text)',
        }}
      />

      {active && (
        <div data-testid="tour-rider-search-results" style={{ marginTop: '0.5rem' }}>
          {results.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--c-muted)', margin: '0.4rem 2px' }}>
              Ingen ryttere fundet i stillingerne.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
              {results.map((r) => {
                const danish = isDanishRider(r.rider);
                const flag = danish ? '🇩🇰' : riderFlag(r.rider);
                return (
                  <li
                    key={r.rider}
                    className="card"
                    data-testid="tour-rider-result"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                      padding: '0.55rem 0.7rem',
                      background: danish ? 'rgba(198,12,48,0.06)' : undefined,
                      borderLeft: danish ? '3px solid #c8102e' : undefined,
                    }}
                  >
                    {flag && <span aria-hidden>{flag}</span>}
                    <span style={{ fontWeight: 700 }}>{r.rider}</span>
                    {r.team && <TeamBadge name={r.team} size={16} />}
                    <span style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                      {SEARCH_COMPS.map(({ key, label, icon }) => (
                        <PlaceChip key={key} icon={icon} label={label} place={r.places[key]} />
                      ))}
                      <PlaceChip icon="🏁" label="Seneste etape" place={r.places.etape} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

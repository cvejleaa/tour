// ---------------------------------------------------------------------------
// RiderSearch – søgefelt til at finde en rytter på tværs af holdene. Viser
// rytterens hold (link til holdsiden), land og UCI-verdensrang. Kun ryttere fra
// hold med offentliggjort startliste kan findes. Ren logik ligger i
// riderSearch.js.
// ---------------------------------------------------------------------------
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchRiders } from './riderSearch';
import { riderWorldRank } from '../../data/uciRanking2026';

export default function RiderSearch({ index }) {
  const [q, setQ] = useState('');
  const active = q.trim().length > 0;
  const results = useMemo(() => (active ? searchRiders(index, q) : []), [index, q, active]);

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Søg efter en rytter…"
        aria-label="Søg efter en rytter"
        data-testid="rider-search-input"
        style={{
          width: '100%', padding: '0.6rem 0.85rem', borderRadius: 10,
          border: '1px solid var(--c-border)', fontSize: '0.95rem',
          background: 'var(--c-surface)', color: 'var(--c-text)',
        }}
      />

      {active && (
        <div data-testid="rider-search-results" style={{ marginTop: '0.5rem' }}>
          {results.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--c-muted)', margin: '0.4rem 2px' }}>
              Ingen ryttere fundet. Kun hold der har offentliggjort deres startliste kan søges.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
              {results.map((r, i) => {
                const wr = riderWorldRank(r.name, r.code);
                return (
                  <li key={`${r.code}-${r.name}-${i}`}>
                    <Link
                      to={`/hold/${r.code}`}
                      data-testid="rider-result"
                      className="card"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                        textDecoration: 'none', color: 'inherit', padding: '0.55rem 0.7rem',
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>
                        {r.leader && <span title="Hovednavn" aria-hidden>⭐ </span>}
                        {r.name}
                      </span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>
                        {r.teamName}
                      </span>
                      {r.country && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)' }}>· {r.country}</span>
                      )}
                      {wr && (
                        <span
                          className="badge badge--muted"
                          style={{ fontSize: '0.7rem', marginLeft: 'auto' }}
                          title="UCI verdensrang"
                        >
                          🌍 #{wr.rank}
                        </span>
                      )}
                    </Link>
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

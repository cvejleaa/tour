// Forside-kort: mini-stilling med top 3 + brugerens egen placering.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

function Row({ pos, name, points, highlight }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.3rem',
        borderRadius: 6, background: highlight ? 'var(--c-bg)' : 'transparent',
        fontWeight: highlight ? 700 : 500,
      }}
    >
      <span className={pos <= 3 ? `medal medal--${pos}` : ''} style={pos > 3 ? { width: 22, textAlign: 'center', color: 'var(--c-muted)' } : undefined}>
        {pos}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ color: 'var(--c-pitch)', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{points}</span>
    </div>
  );
}

export default function MiniStandings({ standings, uid }) {
  const rows = useMemo(() => {
    const list = (standings ?? []).map((u, i) => ({
      uid: u.uid,
      // Ægte konkurrence-placering: deler man point, deler man plads.
      pos: (standings.filter((o) => (o.totalPoints ?? 0) > (u.totalPoints ?? 0)).length) + 1,
      name: u.displayName || 'Spiller',
      points: u.totalPoints ?? 0,
      idx: i,
    }));
    const top = list.slice(0, 3);
    const me = list.find((r) => r.uid === uid);
    if (me && !top.some((r) => r.uid === uid)) top.push(me);
    return top;
  }, [standings, uid]);

  if (rows.length === 0) return null;

  return (
    <div className="card" data-testid="mini-standings" style={{ marginBottom: '1rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
        <h2 className="card__title" style={{ margin: 0 }}>Stilling</h2>
        <Link to="/stilling" className="badge badge--blue" style={{ textDecoration: 'none' }}>Hele stillingen →</Link>
      </div>
      {rows.map((r) => (
        <Row key={r.uid} pos={r.pos} name={r.name} points={r.points} highlight={r.uid === uid} />
      ))}
    </div>
  );
}

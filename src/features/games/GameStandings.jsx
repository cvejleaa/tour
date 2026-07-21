/**
 * GameStandings — rangliste for ét spil. Viser placering, spiller (avatar +
 * navn) og point, med en lille pil for placerings-ændring. Fremhæver den
 * indloggede spiller.
 */
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useGameStandings } from './useGameStandings';
import { rankDelta } from './gameStandings';

function DeltaArrow({ row }) {
  const d = rankDelta(row);
  if (d == null || d === 0) return null;
  const up = d > 0;
  return (
    <span
      title={up ? `Rykket ${d} op` : `Rykket ${-d} ned`}
      style={{ color: up ? 'var(--c-pitch, #2e7d32)' : 'var(--c-red, #c0392b)', fontSize: '0.75rem', marginLeft: 4 }}
    >
      {up ? `▲${d}` : `▼${-d}`}
    </span>
  );
}

export default function GameStandings({ gameId }) {
  const { user } = useAuth();
  const { standings, loading, error } = useGameStandings(gameId);

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;
  if (error) return <p className="badge badge--red">{error}</p>;

  if (standings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏆</div>
        <div className="empty-state__title">Ingen deltagere endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>Stillingen fyldes, når spillere tilmelder sig og tipper.</p>
      </div>
    );
  }

  return (
    <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--c-muted)', fontSize: '0.8rem' }}>
          <th style={{ padding: '0.4rem 0.5rem', width: 44 }}>#</th>
          <th style={{ padding: '0.4rem 0.5rem' }}>Spiller</th>
          <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>Point</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((r) => {
          const isMe = r.uid === user?.uid;
          return (
            <tr
              key={r.uid}
              style={{
                borderTop: '1px solid var(--c-border, #eee)',
                background: isMe ? 'var(--c-surface-2, #f3f7f3)' : 'transparent',
                fontWeight: isMe ? 700 : 400,
              }}
            >
              <td style={{ padding: '0.45rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                {r.rank}<DeltaArrow row={r} />
              </td>
              <td style={{ padding: '0.45rem 0.5rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Avatar uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam} size={26} />
                  {r.name}{isMe && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
                </span>
              </td>
              <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {r.totalPoints}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

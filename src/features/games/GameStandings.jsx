/**
 * GameStandings — rangliste for ét spil. Viser placering, spiller (avatar +
 * navn) og point, med en lille pil for placerings-ændring. Fremhæver den
 * indloggede spiller.
 */
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useGameStandings } from './useGameStandings';
import { rankDelta } from './gameStandings';
import { formatPoints } from './GameLayout';

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

  const meUid = user?.uid;
  const hasPodium = standings.length >= 3;
  const podium = hasPodium ? standings.slice(0, 3) : [];
  const listRows = hasPodium ? standings.slice(3) : standings;
  const meRow = standings.find((r) => r.uid === meUid);
  const meInList = meRow && (!hasPodium || meRow.rank > 3);

  const Row = ({ r, sticky = false }) => {
    const isMe = r.uid === meUid;
    return (
      <tr
        className={sticky ? 'rank-row--me' : ''}
        style={{
          borderTop: '1px solid var(--c-border)',
          background: isMe && !sticky ? 'var(--c-surface-alt)' : undefined,
          fontWeight: isMe ? 700 : 400,
        }}
      >
        <td style={{ padding: '0.45rem 0.5rem', fontVariantNumeric: 'tabular-nums', width: 52 }}>
          {r.rank}<DeltaArrow row={r} />
        </td>
        <td style={{ padding: '0.45rem 0.5rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Avatar uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam} size={26} />
            {r.name}{isMe && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
          </span>
        </td>
        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatPoints(r.totalPoints)}
        </td>
      </tr>
    );
  };

  const MEDAL = ['🥇', '🥈', '🥉'];
  // Podie-rækkefølge: 2. plads, 1. plads (løftet), 3. plads.
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;

  return (
    <div>
      {hasPodium && (
        <div className="podium">
          {podiumOrder.map((r) => (
            <div key={r.uid} className={`podium__spot podium__spot--${r.rank}`}>
              <span className="podium__medal">{MEDAL[r.rank - 1] || `#${r.rank}`}</span>
              <Avatar uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam} size={r.rank === 1 ? 40 : 32} />
              <span className="podium__name">{r.name}</span>
              <span className="podium__pts">{formatPoints(r.totalPoints)} p</span>
            </div>
          ))}
        </div>
      )}

      {listRows.length > 0 && (
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {listRows.map((r) => <Row key={r.uid} r={r} />)}
            {meInList && meRow && !listRows.some((r) => r.uid === meUid) && (
              <Row r={meRow} sticky />
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

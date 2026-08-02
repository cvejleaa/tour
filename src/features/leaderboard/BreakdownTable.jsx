/**
 * BreakdownTable – udspecificeret stilling med 6 talkolonner pr. spiller:
 * de fire etapespørgsmål (🏆 vinder, ⏱️ bedste hold, ⛰️ bjerg, 🚀 sprint),
 * bonus (alle bonusspørgsmål) og total. Evt. utippet-straf vises diskret i
 * total-kolonnen, så tallene altid stemmer med den samlede stilling.
 */
import { useMemo } from 'react';
import { filterByMembers } from './standingsUtils';
import Avatar from '../../components/Avatar';
import { emptyBreakdown } from './standingsBreakdown';

const COLS = [
  { key: 'winnerTeam', icon: '🏆', title: 'Etapevinderens hold' },
  { key: 'gcTeam', icon: '⏱️', title: 'Bedste hold' },
  { key: 'mountainTeam', icon: '⛰️', title: 'Flest bjergpoint' },
  { key: 'sprintTeam', icon: '🚀', title: 'Flest sprintpoint' },
];

export default function BreakdownTable({
  users = [], byUid = {}, meUid = null, memberUids = null, loading = false,
}) {
  const rows = useMemo(() => {
    const withData = filterByMembers(users, memberUids).map((u) => ({
      ...u,
      bd: byUid[u.uid] || emptyBreakdown(),
      bonus: u.bonusPoints ?? 0,
      total: u.totalPoints ?? 0,
    }));
    const sorted = withData.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return (a.displayName || '').localeCompare(b.displayName || '', 'da');
    });
    // Delte pladser ved pointlighed — samme princip som StandingsTable.
    let prevRank = 0;
    return sorted.map((u, i) => {
      const rank = i > 0 && sorted[i - 1].total === u.total ? prevRank : i + 1;
      prevRank = rank;
      return { ...u, rank };
    });
  }, [users, memberUids, byUid]);

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🧮</div>
        <div className="empty-state__title">Ingen spillere at vise.</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table" data-testid="breakdown-table">
        <thead>
          <tr>
            <th style={{ width: '2.5rem' }}>#</th>
            <th>Spiller</th>
            {COLS.map(({ key, icon, title }) => (
              <th key={key} style={{ textAlign: 'right' }} title={title} aria-label={title}>{icon}</th>
            ))}
            <th style={{ textAlign: 'right' }} title="Alle bonusspørgsmål (sæson + klassement)" aria-label="Bonus">🎁</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const isMe = u.uid === meUid;
            return (
              <tr key={u.uid} className={isMe ? 'is-me' : ''}>
                <td><span className="medal medal--n">{u.rank}</span></td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Avatar uid={u.uid} name={u.displayName} emoji={u.avatarEmoji}
                      favoriteTeam={u.favoriteTeam} size={26} />
                    <span className="text-bold" style={{ fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                      {u.displayName || '(ukendt)'}
                    </span>
                    {isMe && <span className="badge badge--blue">dig</span>}
                  </span>
                </td>
                {COLS.map(({ key }) => (
                  <td key={key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>{u.bd[key]}</span>
                  </td>
                ))}
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <span className="text-muted" style={{ fontSize: '0.9rem' }}>{u.bonus}</span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span className="pts">{u.total}</span>
                  {u.bd.straf !== 0 && (
                    <span
                      title="Straf for utippede etaper (-1 pr. etape)"
                      style={{ fontSize: '0.72rem', color: 'var(--c-err)', marginLeft: '0.3rem' }}
                    >
                      ({u.bd.straf})
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

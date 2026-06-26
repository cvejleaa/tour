/**
 * StandingsTable – genbrugelig rangeringstabel.
 * Tager en sorteret liste af brugere og valgfrit fremhæver den indloggede bruger.
 * Bruges til global stilling, dagsvisning og liga-stilling.
 */
import { useMemo } from 'react';
import { filterByMembers } from './standingsUtils';
import Avatar from '../../components/Avatar';

/** Lille pil der viser bevægelse i stillingen siden i går. */
function MovementArrow({ delta }) {
  if (delta === null || delta === undefined) return null;
  if (delta > 0) {
    return <span title={`Op ${delta}`} style={{ color: 'var(--c-pitch, #16a34a)', fontWeight: 700, fontSize: '0.8rem' }}>▲{delta}</span>;
  }
  if (delta < 0) {
    return <span title={`Ned ${-delta}`} style={{ color: 'var(--c-err, #dc2626)', fontWeight: 700, fontSize: '0.8rem' }}>▼{-delta}</span>;
  }
  return <span title="Uændret" style={{ color: 'var(--c-muted)', fontSize: '0.8rem' }}>–</span>;
}

/**
 * @param {object}   props
 * @param {Array}    props.users        – liste af brugerobjekter (uid, displayName, totalPoints)
 * @param {string}   [props.meUid]      – den indloggede brugers uid (fremhæves)
 * @param {string[]} [props.memberUids] – filtrer til kun disse uid'er (null = alle)
 * @param {function} [props.getPoints]  – fn(uid) → number; overskriver totalPoints-feltet
 * @param {boolean}  [props.loading]    – vis spinner
 * @param {string}   [props.emptyMsg]   – tekst når listen er tom
 * @param {boolean}  [props.showAvg]    – vis "Gns."-kolonne (point pr. tippet kamp)
 * @param {function} [props.getTipped]  – fn(uid) → antal tippede kampe (nævner i gns.)
 * @param {'total'|'avg'} [props.sortMode] – sortér efter total eller gennemsnit
 * @param {boolean}  [props.showBreakdown] – vis "Kampe"- og "Bonus"-kolonner (kun global total)
 * @param {function} [props.getBreakdown] – fn(user) → {match, bonus}; overstyrer standard-opdelingen (fx liga-scoring)
 */
export default function StandingsTable({
  users = [],
  meUid = null,
  memberUids = null,
  getPoints = null,
  loading = false,
  emptyMsg = 'Ingen spillere at vise.',
  showMovement = false,
  showAvg = false,
  getTipped = null,
  sortMode = 'total',
  showBreakdown = false,
  getBreakdown = null,
}) {
  // Filtrer og sorter brugerene
  const rows = useMemo(() => {
    // Filtrer til medlemmer af valgt liga
    const filtered = filterByMembers(users, memberUids);

    // Beregn point (evt. fra ekstern funktion, f.eks. dagspoint) + gns. pr. tippet kamp
    const withPoints = filtered.map((u) => {
      const displayPoints = getPoints ? (getPoints(u.uid) ?? 0) : (u.totalPoints ?? 0);
      const tipped = getTipped ? (getTipped(u.uid) ?? 0) : 0;
      const avg = tipped > 0 ? Math.round((displayPoints / tipped) * 10) / 10 : null;
      const bd = getBreakdown ? getBreakdown(u) : null;
      const matchPoints = bd ? bd.match : (u.groupPoints ?? 0) + (u.knockoutPoints ?? 0);
      const bonus = bd ? bd.bonus : (u.bonusPoints ?? 0);
      return { ...u, displayPoints, tipped, avg, matchPoints, bonus };
    });

    // Sortér faldende — efter gns. når valgt, ellers efter total. Tiebreak: total, så navn.
    return withPoints.sort((a, b) => {
      if (showAvg && sortMode === 'avg') {
        const av = a.avg ?? -Infinity;
        const bv = b.avg ?? -Infinity;
        if (bv !== av) return bv - av;
      }
      if (b.displayPoints !== a.displayPoints) return b.displayPoints - a.displayPoints;
      return (a.displayName || '').localeCompare(b.displayName || '', 'da');
    });
  }, [users, memberUids, getPoints, getTipped, showAvg, sortMode, getBreakdown]);

  if (loading) {
    return <div className="spinner" role="status" aria-label="Indlæser" />;
  }

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏆</div>
        <div className="empty-state__title">{emptyMsg}</div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '2.5rem' }}>#</th>
            {showMovement && <th style={{ width: '2.5rem' }} title="Bevægelse siden i går">±</th>}
            <th>Spiller</th>
            {showBreakdown && <th style={{ textAlign: 'right' }} title="Point fra kampe (gruppe + slutspil)">Kampe</th>}
            {showBreakdown && <th style={{ textAlign: 'right' }} title="Point fra bonusspørgsmål">Bonus</th>}
            <th style={{ textAlign: 'right' }}>{showBreakdown ? 'Total' : 'Point'}</th>
            {showAvg && <th style={{ textAlign: 'right' }} title="Gennemsnitlige point pr. tippet kamp">Gns.</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((u, idx) => {
            const isMe = u.uid === meUid;
            const rank = idx + 1;
            const delta = showMovement && typeof u.previousRank === 'number'
              ? u.previousRank - rank
              : null;

            return (
              <tr key={u.uid} className={isMe ? 'is-me' : ''}>
                {/* Placering med medalje til top 3 */}
                <td>
                  {rank <= 3 ? (
                    <span className={`medal medal--${rank}`} aria-label={`Placering ${rank}`}>
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
                    </span>
                  ) : (
                    <span className="medal medal--n">{rank}</span>
                  )}
                </td>

                {showMovement && (
                  <td><MovementArrow delta={delta} /></td>
                )}

                {/* Avatar + spillernavn + evt. "dig"-badge */}
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Avatar uid={u.uid} name={u.displayName} emoji={u.avatarEmoji}
                      favoriteTeam={u.favoriteTeam} size={28} />
                    <span className="text-bold" style={{ fontSize: '0.95rem' }}>
                      {u.displayName || '(ukendt)'}
                    </span>
                    {isMe && (
                      <span className="badge badge--blue" style={{ verticalAlign: 'middle' }}>
                        dig
                      </span>
                    )}
                  </span>
                </td>

                {/* Point fra kampe / bonus (kun global total) */}
                {showBreakdown && (
                  <td style={{ textAlign: 'right' }}>
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>{u.matchPoints}</span>
                  </td>
                )}
                {showBreakdown && (
                  <td style={{ textAlign: 'right' }}>
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>{u.bonus}</span>
                  </td>
                )}

                {/* Total (eller point når breakdown er skjult) */}
                <td style={{ textAlign: 'right' }}>
                  <span className="pts">{u.displayPoints}</span>
                </td>

                {/* Gns. point pr. tippet kamp */}
                {showAvg && (
                  <td style={{ textAlign: 'right' }} title={u.tipped ? `${u.displayPoints} point på ${u.tipped} tippede kampe` : 'Ingen tippede kampe endnu'}>
                    <span className="text-muted" style={{ fontSize: '0.9rem' }}>
                      {u.avg === null ? '–' : u.avg.toFixed(1).replace('.', ',')}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

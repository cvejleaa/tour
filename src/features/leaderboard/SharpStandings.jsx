// 🎯 Skarpskytten-stilling til den offentlige Stilling-side.
// Bruger samme regelsæt som admin-sammenligningen (sharpMatchPoints) + straffen
// for utippet kamp fra config/settings. Scopes til de viste ligamedlemmer.
import { useMemo } from 'react';
import { useStatsData } from '../stats/useStatsData';
import { computeComparison } from '../stats/altStandings';
import { useUntippedPenalty } from './useUntippedPenalty';
import { fmtSigned } from './sharpFormat';
import SharpshooterInfo from './SharpshooterInfo';
import Avatar from '../../components/Avatar';

export default function SharpStandings({ meUid = null, memberUids = null }) {
  const { matches, betsByMatch, usersById, loading, error } = useStatsData();
  const { penalty } = useUntippedPenalty();

  const players = useMemo(
    () => Object.values(usersById || {})
      .filter((u) => u.status === 'approved')
      .map((u) => ({ uid: u.id, name: u.displayName || 'Spiller', avatarEmoji: u.avatarEmoji, favoriteTeam: u.favoriteTeam })),
    [usersById],
  );

  const rows = useMemo(() => {
    const memberSet = memberUids ? new Set(memberUids) : null;
    const computed = computeComparison(matches, betsByMatch, players, -penalty);
    const byUid = Object.fromEntries(players.map((p) => [p.uid, p]));
    return computed
      .filter((r) => !memberSet || memberSet.has(r.uid))
      .map((r) => ({ ...r, ...byUid[r.uid] }))
      .sort((a, b) => b.sharp - a.sharp || a.name.localeCompare(b.name, 'da'));
  }, [matches, betsByMatch, players, penalty, memberUids]);

  return (
    <div className="card card--flat">
      <div className="card__header">
        <h2 className="card__title">🎯 Skarpskytten</h2>
      </div>

      <SharpshooterInfo penalty={penalty} />

      {error && <p className="badge badge--red mb-2" role="alert">{error}</p>}

      {loading ? (
        <div className="spinner" role="status" aria-label="Henter" />
      ) : rows.length === 0 ? (
        <p className="text-muted text-sm">Ingen afgjorte kampe med tips endnu.</p>
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: '0.9rem' }}>
            <thead>
              <tr>
                <th style={{ width: '2rem' }}>#</th>
                <th>Spiller</th>
                <th className="text-center">Tippet</th>
                <th className="text-center">Point</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const mine = r.uid === meUid;
                return (
                  <tr key={r.uid} data-testid="sharp-standings-row" style={mine ? { background: 'var(--c-pitch-tint, rgba(0,128,0,0.06))' } : undefined}>
                    <td className="text-muted">{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Avatar uid={r.uid} name={r.name} emoji={r.avatarEmoji} favoriteTeam={r.favoriteTeam} size={22} />
                        {r.name}
                        {mine && <span className="badge badge--blue">dig</span>}
                      </span>
                    </td>
                    <td className="text-center text-muted">{r.tipped}/{r.matches}</td>
                    <td className="text-center">
                      <strong style={{ color: r.sharp < 0 ? 'var(--c-err)' : 'var(--c-text)' }}>{fmtSigned(r.sharp)}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

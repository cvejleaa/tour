// ---------------------------------------------------------------------------
// MyBetsPage – overblik over brugerens egne tips.
// Viser alle tippede kampe, status, optjente point og samlet sum.
// Giver mulighed for at hoppe til redigering af ulåste tips.
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import {
  isMatchLocked,
  formatKickoffTime,
  dayKey,
  roundLabel,
} from '../features/matches/matchHelpers';
import { teamName } from '../lib/teams';
import Flag from '../components/Flag';
import { scoreMatch, scoreKnockout } from '../lib/scoring';
import { MATCH_STATUS, ROUNDS } from '../lib/constants';

/** Hjælper: returnerer statuslabel og badge-farve for et bet. */
function betStatus(match, bet) {
  if (!bet) return { label: 'Ikke tippet', cls: 'badge--muted' };
  if (match.status === MATCH_STATUS.FINISHED)
    return { label: 'Afgjort', cls: 'badge--green' };
  if (isMatchLocked(match.kickoff))
    return { label: 'Låst', cls: 'badge--red' };
  return { label: 'Afventer', cls: 'badge--blue' };
}

export default function MyBetsPage() {
  const { user } = useAuth();
  const { matches, loading: matchesLoading } = useMatches();
  const { bets, loading: betsLoading } = useMyBets(user?.uid ?? null);

  const isLoading = matchesLoading || betsLoading;

  // Filtrér til kun kampe brugeren har tippet
  const tippedMatches = useMemo(
    () => matches.filter((m) => bets.has(m.id)),
    [matches, bets],
  );

  // Beregn point for afgjorte kampe
  const pointsPerMatch = useMemo(() => {
    const map = new Map();
    for (const m of tippedMatches) {
      if (m.status !== MATCH_STATUS.FINISHED || !m.result) {
        map.set(m.id, null);
        continue;
      }
      const bet = bets.get(m.id);
      const isKnockout = m.round !== ROUNDS.GROUP;
      const pts = isKnockout ? scoreKnockout(bet, m.result) : scoreMatch(bet, m.result);
      map.set(m.id, pts);
    }
    return map;
  }, [tippedMatches, bets]);

  // Samlet sum af kendte point
  const totalPoints = useMemo(() => {
    let sum = 0;
    pointsPerMatch.forEach((pts) => {
      if (pts !== null) sum += pts;
    });
    return sum;
  }, [pointsPerMatch]);

  // Antal ulåste kampe der kan redigeres
  const editableCount = tippedMatches.filter((m) => !isMatchLocked(m.kickoff)).length;

  if (isLoading) {
    return (
      <div className="container">
        <div className="spinner" aria-label="Henter tips…" />
      </div>
    );
  }

  return (
    <div className="container">
      {/* Overskrift */}
      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem' }}>📋 Mine tips</h1>
        <p style={{ margin: 0, color: 'var(--c-muted)', fontSize: '0.88rem' }}>
          Dine afgivne tips og optjente point.
        </p>
      </div>

      {/* Summarisk statistik */}
      <div
        className="card"
        style={{
          marginBottom: '1.25rem',
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-pitch)' }}
            data-testid="total-points"
          >
            {totalPoints}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Point i alt
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-text)' }}>
            {tippedMatches.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Tippede kampe
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-warn)' }}>
            {editableCount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontWeight: 600 }}>
            Kan redigeres
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link to="/kampe" className="btn btn--ghost btn--sm">
            ⚽ Til kampsiden
          </Link>
        </div>
      </div>

      {/* Tom tilstand */}
      {tippedMatches.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🎯</div>
          <div className="empty-state__title">Ingen tips endnu</div>
          <p>Gå til kampsiden for at afgive dine første tips.</p>
          <Link to="/kampe" className="btn" style={{ marginTop: '0.75rem' }}>
            Gå til kampe
          </Link>
        </div>
      )}

      {/* Tippede kampe */}
      {tippedMatches.length > 0 && (
        <div className="card card--flat" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Kamp</th>
                  <th>Kickoff</th>
                  <th>Dit tip</th>
                  <th>Resultat</th>
                  <th>Point</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tippedMatches.map((match) => {
                  const bet = bets.get(match.id);
                  const isKnockout = match.round !== ROUNDS.GROUP;
                  const locked = isMatchLocked(match.kickoff);
                  const pts = pointsPerMatch.get(match.id);
                  const { label: statusLabel, cls: statusCls } = betStatus(match, bet);
                  const homeName = match.homeTeam ? teamName(match.homeTeam) : (match.homePlaceholder ?? '?');
                  const awayName = match.awayTeam ? teamName(match.awayTeam) : (match.awayPlaceholder ?? '?');

                  return (
                    <tr key={match.id}>
                      {/* Kamp */}
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600, fontSize: '0.9rem' }}>
                          {match.homeTeam ? <Flag code={match.homeTeam} size={20} /> : '❓'} {homeName}
                          {' '}vs{' '}
                          {match.awayTeam ? <Flag code={match.awayTeam} size={20} /> : '❓'} {awayName}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)' }}>
                          {roundLabel(match.round)}
                          {match.groupName ? ` · Gruppe ${match.groupName}` : ''}
                        </div>
                      </td>

                      {/* Kickoff */}
                      <td>
                        <span style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>
                          {dayKey(match.kickoff)}
                          <br />
                          {formatKickoffTime(match.kickoff)}
                        </span>
                      </td>

                      {/* Dit tip */}
                      <td>
                        {bet ? (
                          <span style={{ fontWeight: 700 }}>
                            {bet.home}–{bet.away}
                            {isKnockout && bet.advance && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontWeight: 400 }}>
                                Videre: {bet.advance}
                              </div>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--c-muted)' }}>–</span>
                        )}
                      </td>

                      {/* Resultat */}
                      <td>
                        {match.status === MATCH_STATUS.FINISHED && match.result ? (
                          <span style={{ fontWeight: 700 }}>
                            {match.result.home}–{match.result.away}
                            {isKnockout && match.result.advance && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--c-muted)', fontWeight: 400 }}>
                                Videre: {match.result.advance}
                              </div>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--c-muted)' }}>–</span>
                        )}
                      </td>

                      {/* Point */}
                      <td>
                        {pts !== null ? (
                          <span
                            className={`badge ${pts > 0 ? 'badge--green' : 'badge--muted'}`}
                          >
                            {pts > 0 ? `+${pts}` : '0'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--c-muted)' }}>–</span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`badge ${statusCls}`}>{statusLabel}</span>
                      </td>

                      {/* Rediger-link */}
                      <td>
                        {!locked && (
                          <Link
                            to="/kampe"
                            className="btn btn--ghost btn--sm"
                            title="Rediger tip"
                          >
                            ✏️
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

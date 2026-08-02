/**
 * MyTips — "Mine tips": spillerens egne tips på tværs af alle runder, med facit
 * og point. Read-only oversigt (feature-paritet med Tour/VM's tips-historik).
 */
import { useMemo } from 'react';
import { useGameBets } from '../useGameBets';
import { superligaTeamInfo } from '../../../data/superligaTeams2026';
import { formatKickoff } from '../../../lib/daDate';
import { fmtDec, fmtPoints } from '../../../lib/daNum';
import { groupByRound, afterStart, toMillis } from './footballRounds';
import { buildTipsHistory } from './tipsHistory';
import GameTabLink from '../GameTabLink';

const OUTCOME_LABEL = { 1: '1', X: 'X', 2: '2' };
const shortOf = (name) => superligaTeamInfo(name)?.short || name;

function ResultCell({ row }) {
  if (!row.pick) return <span className="mytips__none">—</span>;
  if (!row.settled) return <span className="mytips__pending">afventer</span>;
  return row.hit
    ? <span className="badge badge--green">✓ +{fmtDec(row.points)}</span>
    : <span className="badge badge--red">✗</span>;
}

export default function MyTips({ game, matches }) {
  const gameId = game?.id;
  const { betsByMatch, loading } = useGameBets(gameId);
  // Skjul kampe før spillets starttidspunkt (som i tip-fladen).
  const startMs = toMillis(game?.startAt);
  const shownMatches = useMemo(() => afterStart(matches, startMs), [matches, startMs]);
  const rounds = useMemo(() => groupByRound(shownMatches), [shownMatches]);
  const history = useMemo(() => buildTipsHistory(rounds, betsByMatch), [rounds, betsByMatch]);

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;

  const played = history.rounds.filter((r) => r.tippedCount > 0);
  const { totals } = history;

  if (played.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📋</div>
        <div className="empty-state__title">Du har ikke tippet endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>Sæt dine 1X2 for den kommende runde.</p>
        <p style={{ marginTop: '0.6rem' }}>
          <GameTabLink fane="tip" className="btn btn--sm">Gå til Tip</GameTabLink>
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Opsummering */}
      <div className="card mb-2 mytips__summary">
        <div><b className="mytips__big">{totals.points != null ? fmtPoints(totals.points) : '0'}</b><span>point i alt</span></div>
        <div><b className="mytips__big">{totals.hits}/{totals.settled}</b><span>ramt ({fmtDec(totals.hitRate)}%)</span></div>
        <div><b className="mytips__big">{totals.tipped}</b><span>tips afgivet</span></div>
        {totals.roundBonus > 0 && (
          <div><b className="mytips__big">+{fmtDec(totals.roundBonus)}</b><span>combi-bonus ⚡</span></div>
        )}
      </div>

      {/* Runde for runde (nyeste øverst) */}
      {[...played].reverse().map((r) => (
        <div className="card mb-2" key={r.round}>
          <div className="mytips__head">
            <span className="mytips__round">Runde {r.round}</span>
            <span className="mytips__meta">
              {r.tippedCount}/{r.total} tippet · {r.hitCount} ramt
              {r.roundBonus > 0 && <span className="mytips__bonus"> · combi +{fmtDec(r.roundBonus)} ⚡</span>}
            </span>
          </div>
          <div className="mytips__rows">
            {r.rows.map((row) => (
              <div className={`mytips__row ${row.isChance ? 'mytips__row--chance' : ''}`} key={row.id}>
                <span className="mytips__kick">{formatKickoff(row.kickoff)}</span>
                <span className="mytips__match">
                  {shortOf(row.home)}<span className="mytips__dash">–</span>{shortOf(row.away)}
                </span>
                <span className="mytips__pick">
                  {row.pick ? OUTCOME_LABEL[row.pick] : '–'}
                  {row.isChance && <span title="Chancen brugt" className="mytips__chance">⚡</span>}
                </span>
                <span className="mytips__res"><ResultCell row={row} /></span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * MyTips — "Mine tips": spillerens egne tips på tværs af alle runder, med facit
 * og point.
 *
 * TYND SKAL. Selve visningen bor i TipsHistorik, som spillerdetaljen bruger
 * med præcis samme form. To layouts af "tips med facit og point" ville være
 * to sandheder om de samme data.
 */
import { useMemo } from 'react';
import { useGameBets } from '../useGameBets';
import { groupByRound, afterStart, toMillis } from './footballRounds';
import { buildTipsHistory } from './tipsHistory';
import TipsHistorik from './TipsHistorik';
import GameTabLink from '../GameTabLink';

export default function MyTips({ game, matches, me }) {
  const gameId = game?.id;
  const { betsByMatch, loading } = useGameBets(gameId);
  // Skjul kampe før spillets starttidspunkt (som i tip-fladen).
  const startMs = toMillis(game?.startAt);
  const shownMatches = useMemo(() => afterStart(matches, startMs), [matches, startMs]);
  const rounds = useMemo(() => groupByRound(shownMatches), [shownMatches]);
  // Puljebonussen står på spilleren og skal med i totalen — ellers siger Mine
  // tips et andet tal end Stilling for samme spiller.
  const puljeBonus = Number(me?.bonusPoints) || 0;
  const history = useMemo(
    () => buildTipsHistory(rounds, betsByMatch, puljeBonus),
    [rounds, betsByMatch, puljeBonus],
  );

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;

  return (
    <TipsHistorik
      history={history}
      // Serverens tal, ikke historikkens: stillingen viser det samme, og to
      // veje til ét tal driver fra hinanden.
      opdeling={me?.opdeling ?? null}
      total={me?.totalPoints}
      tom={(
        <div className="empty-state">
          <div className="empty-state__icon">📋</div>
          <div className="empty-state__title">Du har ikke tippet endnu.</div>
          <p style={{ color: 'var(--c-muted)' }}>Sæt dine 1X2 for den kommende runde.</p>
          <p style={{ marginTop: '0.6rem' }}>
            <GameTabLink fane="tip" className="btn btn--sm">Gå til Tip</GameTabLink>
          </p>
        </div>
      )}
    />
  );
}

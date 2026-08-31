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
import { groupByRound } from './footballRounds';
import { fraStartRunde, startRundeFor } from '../../../lib/startGate';
import { teamsOf } from './teamInfo';
import { buildTipsHistory } from './tipsHistory';
import TipsHistorik from './TipsHistorik';
import GameTabLink from '../GameTabLink';

export default function MyTips({ game, matches, me }) {
  const gameId = game?.id;
  const { betsByMatch, loading } = useGameBets(gameId);
  // Skjul kampe før spillets starttidspunkt (som i tip-fladen).
  const startRunde = useMemo(() => startRundeFor(game, matches), [game, matches]);
  const shownMatches = useMemo(() => fraStartRunde(matches, startRunde), [matches, startRunde]);
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
      // Holdene kommer fra SPILLET. Uden dem faldt kortkoderne tilbage på den
      // danske liste, og et engelsk spil ville vise fulde holdnavne.
      teams={teamsOf(game)}
      // Serverens tal, ikke historikkens: to veje til ét tal driver fra
      // hinanden. BEMÆRK at det er SPILLETS total — stillingen kan vise et
      // andet tal for den samme spiller, når ens liga tæller fra en senere
      // runde. Det er ikke en uoverensstemmelse, men to skalaer: her står
      // regnskabet for alle ens tips, dér står ligaens opgør. Kommentaren
      // påstod før, at "stillingen viser det samme"; det holdt kun, så længe
      // stillingen ignorerede ligaens startrunde.
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

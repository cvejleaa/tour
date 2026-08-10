/**
 * SpillerDetalje — én spillers afgjorte kampe med tip, facit og udbytte.
 *
 * TYND SKAL, ligesom MyTips. Serveren gemmer rækkerne i SAMME form som
 * betsByMatch, så buildTipsHistory kan tegne en fremmed spillers historik uden
 * én linje ny beregning — og TipsHistorik viser den præcis som ens egen.
 *
 * Rækkerne indeholder kun kampe, der er afgjort OG begyndt. Det er serveren,
 * der afgør det (pointOpdeling), ikke denne flade.
 */
import { useMemo } from 'react';
import { groupByRound, afterStart, toMillis } from './footballRounds';
import { teamsOf } from './teamInfo';
import { buildTipsHistory } from './tipsHistory';
import { useSpillerOpdeling } from './useSpillerOpdeling';
import TipsHistorik from './TipsHistorik';

/**
 * @param {{game: object, matches: Array, spiller: {uid:string, name:string,
 *          opdeling?: object|null, totalPoints?: number}, onLuk?: Function}} props
 */
export default function SpillerDetalje({ game, matches, spiller, onLuk }) {
  const { kampe, loading, error } = useSpillerOpdeling(game?.id, spiller?.uid);

  const startMs = toMillis(game?.startAt);
  const shownMatches = useMemo(() => afterStart(matches, startMs), [matches, startMs]);
  const rounds = useMemo(() => groupByRound(shownMatches), [shownMatches]);
  const history = useMemo(
    // Puljebonussen er allerede med i spillerens gemte total; her ville den
    // blive talt to gange. Totalen nedenfor kommer fra serveren.
    () => buildTipsHistory(rounds, kampe || {}, 0),
    [rounds, kampe],
  );

  return (
    <div className="card mb-2">
      <div className="flex items-center" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>{spiller?.name}</h3>
        {onLuk && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onLuk}>Luk</button>
        )}
      </div>

      {loading && <div className="spinner" role="status" aria-label="Indlæser" />}

      {/* En afvist læsning er den forventede fejl — sig hvad der skete, i
          stedet for at vise en tom liste uden forklaring. */}
      {error && <p className="badge badge--red" style={{ marginTop: '0.5rem' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ marginTop: '0.6rem' }}>
          <TipsHistorik
            history={history}
            // HOLDENE SKAL MED. Uden dem falder `shortOf` tilbage på det fulde
            // navn, og så viser panelet fulde navne på en telefon, hvor "Mine
            // tips" viser kortkoder. Forskellen var utilsigtet — den kom af en
            // manglende prop, ikke af en beslutning — og den er præcis den
            // slags drift, sammeVisning-testen findes for at fange.
            teams={teamsOf(game)}
            opdeling={spiller?.opdeling ?? null}
            total={spiller?.totalPoints}
            // Rækkerne her er KUN afgjorte-og-begyndte kampe, så optællingen
            // skal hedde noget andet end på "Mine tips".
            kunAfgjorte
            tom={(
              <p style={{ color: 'var(--c-muted)', margin: 0 }}>
                Ingen afgjorte kampe endnu.
              </p>
            )}
          />
          {/* En "Luk" også i bunden: efter 22 runder er knappen i toppen langt
              væk, og der er ingen anden vej ud af panelet. */}
          {onLuk && (
            <p style={{ marginTop: '0.6rem' }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onLuk}>Luk</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

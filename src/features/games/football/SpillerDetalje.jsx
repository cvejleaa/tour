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
import { groupByRound } from './footballRounds';
import { fraStartRunde, startRundeFor } from '../../../lib/startGate';
import { teamsOf } from './teamInfo';
import { buildTipsHistory } from './tipsHistory';
import { useSpillerOpdeling } from './useSpillerOpdeling';
import TipsHistorik from './TipsHistorik';
import Indbyrdes from './Indbyrdes';

/**
 * @param {{game: object, matches: Array, spiller: {uid:string, name:string,
 *          opdeling?: object|null, totalPoints?: number},
 *          minUid?: string|null, onLuk?: Function}} props
 *   `minUid` er den, der KIGGER. Uden den vises det indbyrdes opgør ikke —
 *   panelet skal kunne bruges uden, ikke fejle.
 */
export default function SpillerDetalje({ game, matches, spiller, minUid = null, onLuk }) {
  const { kampe, loading, error } = useSpillerOpdeling(game?.id, spiller?.uid);

  const startRunde = useMemo(() => startRundeFor(game, matches), [game, matches]);
  const shownMatches = useMemo(() => fraStartRunde(matches, startRunde), [matches, startRunde]);
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
            // HOLDENE SKAL MED. Uden dem falder `visOf` tilbage på det rå navn,
            // og så viser panelet "Brighton and Hove Albion", hvor "Mine tips"
            // ved siden af siger "Brighton". Proppen manglede engang helt, og
            // dengang gjaldt det kortkoden i stedet — begrundelsen skiftede,
            // behovet gjorde ikke. Forskellen kom af en manglende prop, ikke af
            // en beslutning, og det er præcis den slags drift,
            // sammeVisning-testen findes for at fange.
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
          {/* Sæsonens opgør mod netop denne spiller. Foldet sammen som
              udgangspunkt: to ekstra dokumentlæsninger skal kun betales af
              den, der faktisk vil se det. Runderne er de SAMME som ovenfor,
              altså allerede gate't til SPILLETS startrunde (ikke ligaens). */}
          <Indbyrdes
            game={game}
            rounds={rounds}
            minUid={minUid}
            dueUid={spiller?.uid}
            dueNavn={spiller?.name}
            teams={teamsOf(game)}
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

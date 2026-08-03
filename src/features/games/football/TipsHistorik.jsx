/**
 * TipsHistorik — tips runde for runde med facit og point.
 *
 * REN VISNING. Den siger intet om, HVEM historikken tilhører: både "Mine tips"
 * og spillerdetaljen fodrer den, og de skal se ens ud. Bygges de hver for sig,
 * har appen to sandheder om de samme data, og de driver fra hinanden ved næste
 * ændring — præcis som de to formler for "point i alt" gjorde.
 */
import { superligaTeamInfo } from '../../../data/superligaTeams2026';
import { formatKickoff } from '../../../lib/daDate';
import { fmtDec } from '../../../lib/daNum';
import PointOpdeling from './PointOpdeling';

const OUTCOME_LABEL = { 1: '1', X: 'X', 2: '2' };
const shortOf = (name) => superligaTeamInfo(name)?.short || name;

function ResultCell({ row }) {
  if (!row.pick) return <span className="mytips__none">—</span>;
  if (!row.settled) return <span className="mytips__pending">afventer</span>;
  return row.hit
    ? <span className="badge badge--green">✓ +{fmtDec(row.points)}</span>
    : <span className="badge badge--red">✗</span>;
}

/**
 * @param {{history: object, opdeling?: object|null, total?: number,
 *          raaTotal?: number|null, tom?: import('react').ReactNode}} props
 */
export default function TipsHistorik({ history, opdeling = null, total, raaTotal = null, tom = null }) {
  const played = history.rounds.filter((r) => r.tippedCount > 0);
  const { totals } = history;
  const harPoint = Number(total) > 0 || !!opdeling;

  // Ingen rækker OG ingen point: der er intet at bryde op, så vis kun den tomme
  // tilstand.
  //
  // Men har spilleren point uden rækker — fx fordi opdelingen ikke er bagfyldt
  // endnu — må totalen ikke forsvinde. Så ville panelet sige "ingen kampe",
  // mens stillingen ved siden af viser 60 point.
  if (played.length === 0 && !harPoint) return tom;

  return (
    <div>
      {/* Opdelingen står ØVERST og er den samme komponent som i stillingen.
          Totalen kommer fra serveren, ikke fra historikken: den er den
          autoritative, og rubrikkerne kan afvige nogle tiendedele fra den. */}
      <div className="card mb-2">
        <PointOpdeling
          opdeling={opdeling}
          total={total != null ? total : totals.points}
          raaTotal={raaTotal}
          kompakt
        />
      </div>

      {played.length > 0 ? (
        <div className="card mb-2 mytips__summary">
          <div><b className="mytips__big">{totals.hits}/{totals.settled}</b><span>ramt ({fmtDec(totals.hitRate)}%)</span></div>
          <div><b className="mytips__big">{totals.tipped}</b><span>tips afgivet</span></div>
        </div>
      ) : tom}

      {/* Runde for runde, nyeste øverst. */}
      {[...played].reverse().map((r) => (
        <div className="card mb-2" key={r.round}>
          <div className="mytips__head">
            <span className="mytips__round">Runde {r.round}</span>
            <span className="mytips__meta">
              {r.tippedCount}/{r.total} tippet · {r.hitCount} ramt
              {/* 🔗 og ikke ⚡: ⚡ er Chancen, og den står på rækkerne nedenfor.
                  Samme tegn til to ting på samme skærm er forvirring. */}
              {r.roundBonus > 0 && <span className="mytips__bonus"> · combi +{fmtDec(r.roundBonus)} 🔗</span>}
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

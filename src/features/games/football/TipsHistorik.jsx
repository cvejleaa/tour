/**
 * TipsHistorik — tips runde for runde med facit og point.
 *
 * REN VISNING. Den siger intet om, HVEM historikken tilhører: både "Mine tips"
 * og spillerdetaljen fodrer den, og de skal se ens ud. Bygges de hver for sig,
 * har appen to sandheder om de samme data, og de driver fra hinanden ved næste
 * ændring — præcis som de to formler for "point i alt" gjorde.
 */
import { shortOf } from './teamInfo';
import { formatKickoff } from '../../../lib/daDate';
import { fmtDec, fmtPoints, fmtSignedPoints } from '../../../lib/daNum';
import PointOpdeling, { RUBRIKKER } from './PointOpdeling';

const OUTCOME_LABEL = { 1: '1', X: 'X', 2: '2' };

function ResultCell({ row }) {
  if (!row.pick) return <span className="mytips__none">—</span>;
  if (!row.settled) return <span className="mytips__pending">afventer</span>;

  // Chancen er ikke afregnet. Så findes tallet ikke — hverken −4, som ville
  // være løgn, eller 0, som ville være et gæt.
  //
  // TEKSTEN BÆRER SIG SELV. "Chancen ikke afregnet" læses som "vent, den
  // kommer" — og for den ene af de to grunde er det direkte forkert: kampen
  // manglede odds, så den kommer aldrig. Forklaringen lå i en `title`, og
  // title findes ikke på en telefon, som er den flade, spillet bruges på.
  //
  // Og tippets egne point skal STADIG stå der: outcomeReward falder tilbage på
  // DEFAULT_POINTS, så et ramt tip uden odds gav faktisk point. Uden dem gik
  // "✓ +4" tabt og blev til en ren fejlbesked om noget helt andet.
  if (row.isChance && !row.chanceAfregnet) {
    return (
      <span className="badge">
        {row.hit ? `✓ ${fmtSignedPoints(row.points)}` : '✗'}
        {row.chanceGrund === 'afventer'
          ? ' · ⚡ afregnes om lidt'
          : ' · ⚡ ingen odds, hverken vundet eller tabt'}
      </span>
    );
  }

  // TABT TIP. Uden chance er der intet tal at vise — 0 point er ikke en
  // oplysning. MED chance er tabet hele historien, og det stod ingen steder:
  // serveren gemmer kun summen, og ved et forkert tip ER summen chance-tabet
  // (outcomePoints giver 0, når man tipper forkert).
  //
  // Ingen ⚡ her: rækken bærer allerede to — klassen mytips__row--chance og
  // ⚡'et ved siden af tippet. Et tredje ville være støj, og det røde
  // fortegnstal siger det selv.
  //
  // Teksten udledes af DELTAET, ikke af chanceStake. Reglerne validerer ikke
  // feltet, og serveren scorer uden bank-loft, så clampStake klipper ved 8: en
  // forfalsket indsats på 100 ville give mærket −8 og en tekst om 100 point.
  if (!row.hit) {
    return row.isChance
      ? (
        <span className="badge badge--red" title={`Chancen tabt: ${fmtPoints(Math.abs(row.chanceDelta))} point`}>
          ✗ {fmtSignedPoints(row.chanceDelta)}
        </span>
      )
      : <span className="badge badge--red">✗</span>;
  }

  // RAMT. Tallet rummer både tippet og en evt. chance-gevinst, og uden en
  // forklaring kunne man ikke se, hvorfor en kamp til odds 3,0 gav 19 point.
  // Fordelingen ligger i title'en frem for i cellen: to tegn i en tabelcelle
  // presser kolonnen, og ⚡ står allerede på rækken.
  return (
    <span
      className="badge badge--green"
      title={row.isChance
        ? `${fmtPoints(row.tipPoints)} for tippet + ${fmtPoints(row.chanceDelta)} fra Chancen`
        : undefined}
    >
      ✓ {fmtSignedPoints(row.points)}
    </span>
  );
}

/**
 * @param {{history: object, opdeling?: object|null, total?: number,
 *          kunAfgjorte?: boolean, tom?: import('react').ReactNode}} props
 */
export default function TipsHistorik({
  history, opdeling = null, total, kunAfgjorte = false, tom = null, teams = null,
}) {
  const played = history.rounds.filter((r) => r.tippedCount > 0);
  const { totals } = history;
  // Fire nuller er ikke "point". En spiller, der ikke har tippet, har en
  // opdeling med lutter nuller, så snart serveren har været forbi ham — og
  // uden dette tjek fik han et pointkort med nuller OVENOVER "du har ikke
  // tippet endnu".
  const harTal = !!opdeling && RUBRIKKER.some(({ key }) => (Number(opdeling[key]) || 0) !== 0);
  const harPoint = Number(total) > 0 || harTal;

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
          kompakt
        />
      </div>

      {played.length > 0 ? (
        <div className="card mb-2 mytips__summary">
          <div><b className="mytips__big">{totals.hits}/{totals.settled}</b><span>ramt ({fmtDec(totals.hitRate)}%)</span></div>
          {/* Mærkaten skal sige, HVAD der tælles. I spillerdetaljen rummer
              rækkerne kun afgjorte-og-begyndte kampe, så "tips afgivet" ville
              stå med et lavere tal end på Mine tips for den samme person. */}
          <div>
            <b className="mytips__big">{totals.tipped}</b>
            <span>{kunAfgjorte ? 'tips på afgjorte kampe' : 'tips afgivet'}</span>
          </div>
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
              {/* Var runden splittet, skal det stå HER. Ellers ser en spiller
                  "6/6 tippet · 4 ramt" uden combi og tror, bonussen er væk —
                  i stedet for at to af kampene aldrig var på kuponen. */}
              {r.udenfor?.length > 0 && (
                <span className="mytips__udenfor" data-testid={`udenfor-${r.round}`}>
                  {' '}· kupon {r.kupon} kampe
                  {' '}({r.udenfor.length} uden for ugen)
                </span>
              )}
            </span>
          </div>
          <div className="mytips__rows">
            {r.rows.map((row) => (
              <div className={`mytips__row ${row.isChance ? 'mytips__row--chance' : ''}`} key={row.id}>
                <span className="mytips__kick">{formatKickoff(row.kickoff)}</span>
                <span className="mytips__match">
                  {shortOf(teams, row.home)}<span className="mytips__dash">–</span>{shortOf(teams, row.away)}
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

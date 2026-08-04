// ---------------------------------------------------------------------------
// PointOpdeling — hvor en spillers point kommer fra, vist ét sted og ens.
//
// ÉN komponent, flere flader. Bygges opdelingen særskilt i stillingen og i
// spillerdetaljen, viser de samme tal med hver sin rækkefølge og hvert sit ord
// — og de driver fra hinanden ved næste ændring. Det var netop dét, der skete
// med "point i alt", som blev regnet to steder og allerede var uenige.
//
// Tallene kommer FÆRDIGE fra serveren (players/{uid}.opdeling). Her regnes
// intet ud over ét: om rubrikkerne summer til totalen. Se opdelingsAfvigelse.
// ---------------------------------------------------------------------------
import { fmtPoints, fmtSignedPoints } from '../../../lib/daNum';
import { formatPoints } from '../GameLayout';

// Fast rækkefølge, faste ord, faste ikoner. "Chancen" og "Combi" er de navne,
// spillet og hjælpesiden allerede bruger — et nyt ord for en mekanik, brugeren
// har lært, er ren forvirring.
//
// "Tippoint" og ikke "1X2": ALLE tip er 1X2-tip, også dem man satte Chancen
// på, og de bidrager til begge rubrikker. "1X2" ville læses som "mine tip", og
// så gav et tal i Chancen ved siden af ingen mening. 🎯 er samme tegn, som
// hjælpesiden bruger om "Point følger oddsene".
//
// ⚡ er Chancen overalt i appen. Combi må derfor IKKE også få ⚡, selv om
// rundeoverskriften i Mine tips gør det i dag.
export const RUBRIKKER = [
  { key: 'p1x2', ikon: '🎯', navn: 'Tippoint', hjaelp: 'Point for rigtige tip. Følger kampens odds.' },
  { key: 'chance', ikon: '⚡', navn: 'Chancen', hjaelp: 'Gevinst og tab på de tip, du satte point på spil på.' },
  { key: 'combi', ikon: '🔗', navn: 'Combi', hjaelp: 'Kupon-bonus for en runde, du har tippet fuldt ud.' },
  { key: 'pulje', ikon: '🎖️', navn: 'Pulje', hjaelp: 'Point for dit mesterskabsspil-tip.' },
];

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// Fire tal afrundet hver for sig kan afvige fra ét afrundet tal. Tærsklen er
// sat over den støj (4 × 0,05 + 0,05), så noten kun fyrer på ægte forskelle.
const TAERSKEL = 0.25;

/**
 * Summer rubrikkerne og sammenlign med totalen. Returnerer null, når de
 * stemmer — ellers hvad der skal siges om forskellen.
 *
 * Der ER situationer, hvor de ikke kan stemme, og de er ikke fejl:
 *  - GULVET: saldoen går aldrig i minus. 11 + (−44,8) + 8,5 giver 0 på skærmen.
 *  - EN KAMP, DER IKKE KUNNE LÆSES: serveren lægger alle bets i totalen, men
 *    springer over i rubrikkerne, hvis kampens facit er fjernet igen, eller
 *    kampdokumentet mangler. Så ligger pointene i totalen og i ingen rubrik.
 *
 * Uden en note ser regnskabet forkert ud — og knappen hedder netop noget med
 * at specificere pointene, hvilket er et løfte om, at det går op.
 *
 * BEREGNES HER og ikke af serveren. Et `raaTotal`-felt, ingen kalder sendte
 * med, var den forrige udgave af netop denne note: grøn test, tom skærm.
 */
export function opdelingsAfvigelse(opdeling, total) {
  if (!opdeling) return null;
  const dele = round1(RUBRIKKER.reduce((s, { key }) => s + (Number(opdeling[key]) || 0), 0));
  const t = round1(total);
  const diff = round1(dele - t);
  if (Math.abs(diff) <= TAERSKEL) return null;
  return { dele, total: t, diff, gulvet: dele < 0 && t === 0 };
}

/** Sætningen, der forklarer en afvigelse. Samme ord i kortet og i tabellen. */
export function afvigelsesTekst(a) {
  if (!a) return null;
  if (a.gulvet) {
    return `Delene giver ${fmtPoints(a.dele)} tilsammen. Saldoen kan ikke gå i minus, så totalen står på 0.`;
  }
  return `Delene giver ${fmtPoints(a.dele)} tilsammen, men totalen er ${fmtPoints(a.total)}. `
    + 'Totalen er den rigtige — forskellen er point fra kampe, opdelingen ikke kunne læse.';
}

/**
 * @param {{opdeling?: {p1x2:number, chance:number, combi:number, pulje:number}|null,
 *          total?: number, kompakt?: boolean}} props
 */
export default function PointOpdeling({ opdeling, total, kompakt = false }) {
  // Serveren skriver rubrikkerne ved næste genberegning. Indtil da findes
  // feltet ikke — og fire nuller ville påstå, at spilleren ingen point har
  // fået. TOTALEN kender vi derimod altid, og den skal blive stående: uden den
  // ville "point i alt" forsvinde fra skærmen, indtil serveren når rundt.
  if (!opdeling) {
    return (
      <div className="pointopdeling">
        <dl className="pointopdeling__liste">
          <div className="pointopdeling__rubrik pointopdeling__rubrik--total">
            <dt>I alt</dt>
            <dd>{formatPoints(total ?? 0)}</dd>
          </div>
        </dl>
        <p className="pointopdeling__note">
          Opdelingen er ikke klar endnu — den bygges, næste gang en kamp afgøres.
        </p>
      </div>
    );
  }

  const afvigelse = opdelingsAfvigelse(opdeling, total);

  return (
    <div className="pointopdeling">
      <dl className={`pointopdeling__liste${kompakt ? ' pointopdeling__liste--kompakt' : ''}`}>
        {RUBRIKKER.map(({ key, ikon, navn, hjaelp }) => (
          <div className="pointopdeling__rubrik" key={key} title={hjaelp}>
            <dt>
              <span aria-hidden="true">{ikon}</span> {navn}
            </dt>
            {/* Chancen er den eneste rubrik, der kan være negativ. Fortegnet
                skal derfor være tydeligt — og et ægte minus, ikke en
                bindestreg, der ligner en tankestreg i en talkolonne. */}
            <dd>{key === 'chance' ? fmtSignedPoints(opdeling[key] ?? 0) : formatPoints(opdeling[key] ?? 0)}</dd>
          </div>
        ))}
        <div className="pointopdeling__rubrik pointopdeling__rubrik--total">
          <dt>I alt</dt>
          <dd>{formatPoints(total ?? 0)}</dd>
        </div>
      </dl>

      {afvigelse && <p className="pointopdeling__note">{afvigelsesTekst(afvigelse)}</p>}
    </div>
  );
}

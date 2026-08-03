// ---------------------------------------------------------------------------
// PointOpdeling — hvor en spillers point kommer fra, vist ét sted og ens.
//
// ÉN komponent, flere flader. Bygges opdelingen særskilt i stillingen og i
// spillerdetaljen, viser de samme tal med hver sin rækkefølge og hvert sit ord
// — og de driver fra hinanden ved næste ændring. Det var netop dét, der skete
// med "point i alt", som blev regnet to steder og allerede var uenige.
//
// Tallene kommer FÆRDIGE fra serveren (players/{uid}.opdeling). Her regnes
// intet; komponenten viser kun.
// ---------------------------------------------------------------------------
import { formatPoints } from '../GameLayout';

// Fast rækkefølge, faste ord, faste ikoner. "Chancen" og "Combi" er de navne,
// spillet og hjælpesiden allerede bruger — et nyt ord for en mekanik, brugeren
// har lært, er ren forvirring.
//
// ⚡ er Chancen overalt i appen. Combi må derfor IKKE også få ⚡, selv om
// rundeoverskriften i Mine tips gør det i dag.
export const RUBRIKKER = [
  { key: 'p1x2', ikon: '⚽', navn: '1X2', hjaelp: 'Point for rigtige 1X2-tip. Følger kampens odds.' },
  { key: 'chance', ikon: '⚡', navn: 'Chancen', hjaelp: 'Gevinst og tab på de tip, du satte point på spil på.' },
  { key: 'combi', ikon: '🔗', navn: 'Combi', hjaelp: 'Bonus for en hel runde med højst én fejl.' },
  { key: 'pulje', ikon: '🎖️', navn: 'Pulje', hjaelp: 'Point for dit mesterskabsspil-tip.' },
];

/**
 * @param {{opdeling?: {p1x2:number, chance:number, combi:number, pulje:number}|null,
 *          total?: number, raaTotal?: number|null, kompakt?: boolean}} props
 */
export default function PointOpdeling({ opdeling, total, raaTotal = null, kompakt = false }) {
  // Serveren skriver opdelingen ved næste genberegning. Indtil da findes feltet
  // ikke — og fire nuller ville være en påstand om, at spilleren ingen point
  // har fået. Sig hellere, at tallet ikke er klar.
  if (!opdeling) {
    return (
      <p className="badge badge--muted" style={{ margin: 0 }}>
        Opdelingen er ikke klar endnu — den bygges, næste gang en kamp afgøres.
      </p>
    );
  }

  // Gulvet er en feature: saldoen går aldrig i minus. Men det betyder, at
  // rubrikkerne kan summe til noget helt andet end totalen — 11 + (−44,8) + 8,5
  // giver 0. Uden en forklaring ser regnestykket forkert ud.
  const gulvet = Number.isFinite(raaTotal) && raaTotal < 0 && total === 0;

  return (
    <div className="pointopdeling">
      <dl className={`pointopdeling__liste${kompakt ? ' pointopdeling__liste--kompakt' : ''}`}>
        {RUBRIKKER.map(({ key, ikon, navn, hjaelp }) => (
          <div className="pointopdeling__rubrik" key={key} title={hjaelp}>
            <dt>
              <span aria-hidden="true">{ikon}</span> {navn}
            </dt>
            <dd>{formatPoints(opdeling[key] ?? 0)}</dd>
          </div>
        ))}
        <div className="pointopdeling__rubrik pointopdeling__rubrik--total">
          <dt>I alt</dt>
          <dd>{formatPoints(total ?? 0)}</dd>
        </div>
      </dl>

      {gulvet && (
        <p className="pointopdeling__note">
          Delene giver {formatPoints(raaTotal)} tilsammen. Saldoen kan ikke gå i minus,
          så totalen står på 0.
        </p>
      )}
    </div>
  );
}

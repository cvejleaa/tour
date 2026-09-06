/**
 * HoldXgListe — mål mod målchancer for ALLE hold i spillet, hold for hold.
 *
 * Bor under Elo-tabellen, fordi det er samme spørgsmål stillet med et andet
 * tal: hvem er stærkere, end resultaterne siger? Elo måler det på udfald,
 * denne liste på chancer.
 *
 * ALDRIG "sæsonen". Premier League-spillet dækker runde 1–18 af 38, så
 * "sæsonens hold-liste" ville være usandt for halvdelen af spillerne.
 * Undertitlen siger "i dette spil" — det er præcist for begge.
 *
 * DIFFERENSEN VISES MED FORTEGN, ALDRIG MED FARVE. Reglen er:
 *
 *   Et afledt tal må vises med fortegn, når begge bestanddele står ved siden
 *   af og grundlaget (n) står på skærmen. Farve må det aldrig.
 *
 * Fortegnet kan efterregnes af de tre kolonner ved siden af; en farve kan
 * ikke — den siger "godt" eller "skidt" om et tal, der ifølge målingen
 * (scripts/maal-xg.mjs) peger på det modsatte hold i mere end hver tredje
 * afgjorte kamp. Sprogreglen ligger som test i xgFlade.test.jsx, ikke som
 * aftale i denne kommentar.
 */
import { useMemo } from 'react';
import { teamsOf, teamInfo } from './teamInfo';
import { holdXgListe } from './holdStatistik';
import ClubBadge from '../../../components/ClubBadge';
import GameTabLink from '../GameTabLink';
import { fmtDec, fmtSignedDec } from '../../../lib/daNum';
import { fraStartRunde, startRundeFor } from '../../../lib/startGate';

export default function HoldXgListe({ game, matches: alleKampe }) {
  // SAMME GATE SOM HOLDSIDEN og Tip-fanen (fraStartRunde): listen her og
  // holdsidens xG-kort viser de samme tal om de samme hold ét klik fra
  // hinanden — «ét klik må ikke give to svar». Uden gaten talte listen runde
  // 1 med i et spil, der starter i runde 2 (QC-fund på #225).
  const matches = useMemo(() => fraStartRunde(alleKampe, startRundeFor(game, alleKampe)), [game, alleKampe]);
  const teams = teamsOf(game);
  const raekker = useMemo(() => holdXgListe(matches, teams), [matches, teams]);

  // null og ikke en tom tabel: under gulvet er der ikke en liste at vise, og
  // et hold uden målchancer må ALDRIG stå med 0,0 — se holdXgListe.
  if (!raekker) return null;

  return (
    <div className="card mb-2">
      <h3 className="card__title">🎯 Mål og målchancer — hold for hold</h3>
      <p style={{ color: 'var(--c-muted)', margin: '0 0 0.6rem' }}>
        Hvor mange mål holdene har scoret i dette spil, mod hvor mange
        målchancer de har haft. Sorteret efter forskellen <strong>pr. kamp</strong>:
        holdene har spillet forskelligt mange kampe, og en sum ville sætte
        holdet med mindst data yderst. Kun hold med mindst tre kampe med
        målchancer er med.
      </p>
      <div className="table-wrap">
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Hold</th>
              <th style={{ textAlign: 'right' }}>Kampe</th>
              <th style={{ textAlign: 'right' }}>Mål</th>
              <th style={{ textAlign: 'right' }}>Målchancer</th>
              <th style={{ textAlign: 'right' }}>Mål − målchancer pr. kamp</th>
            </tr>
          </thead>
          <tbody>
            {raekker.map((r) => {
              const info = teamInfo(teams, r.navn);
              return (
                <tr key={r.navn}>
                  <td>
                    <span className="elo-team">
                      <ClubBadge
                        variant="troeje" code={info?.short} color={info?.color} size={20}
                        color2={info?.troejer?.hjemme?.sekundaer}
                        moenster={info?.troejer?.hjemme?.moenster}
                        aerme={info?.troejer?.hjemme?.aerme} title={r.navn}
                      />
                      {/* Samme indgang til holdsiden som i Elo-tabellen: kun
                          med kortkode, ellers er der ingen URL-nøgle. */}
                      {info?.short ? (
                        <GameTabLink fane="elo" hold={info.short} className="elo-team__name" title={r.navn}>
                          {info?.vis || r.navn}
                        </GameTabLink>
                      ) : (
                        <span className="elo-team__name" title={r.navn}>{info?.vis || r.navn}</span>
                      )}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.kampe}</td>
                  <td style={{ textAlign: 'right' }}><strong>{r.maal}</strong></td>
                  <td style={{ textAlign: 'right' }}>{fmtDec(r.xg)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtSignedDec(r.prKamp, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.6rem 0 0' }}>
        Målchancer (xG) er kildens model for, hvor store chancer et hold fik.
        Den er uenig med resultatet i mere end hver tredje afgjorte kamp, så
        tallet beskriver kampene — det dømmer dem ikke. Kampe, hvor kilden
        endnu ikke har leveret målchancer, tæller ikke med i NOGEN af
        kolonnerne.
      </p>
    </div>
  );
}

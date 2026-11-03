/**
 * TabelRaekke — ÉN række i en holdtabel: placering, badge (trøje eller
 * landeflag), navn som link til holdsiden, K V U T Mål ± P.
 *
 * Trukket ud af FootballTable, så den officielle tabel og 📊 Grupper tegner
 * holdene ens — samme badge, samme flag (flagFlader.test.jsx er listen) og
 * samme indgang til holdsiden. En kopi i Grupper ville drive fra tabellen
 * første gang, nogen rettede den ene.
 *
 * Rækken tager samme form som `game.standings`-rækkerne:
 *   { rank, teamName, teamShortName?, played, won, draw, lost, gf, ga, points }
 * og to valgfri tilføjelser, som kun Grupper bruger:
 *   rank: null   ingen placering endnu (før gruppens første afgjorte kamp) —
 *                cellen står tom; et tal dér ville være en placering, der
 *                ikke findes.
 *   delt: true   holdet deler placering med naboen (samme tal); fladen
 *                forklarer det under tabellen.
 *   maerke       en lille markering efter navnet (Grupper: 🎖️ og ✓).
 *   className    rækkens klasse (Grupper: stregen efter de, der går videre).
 */
import { teamInfo } from './teamInfo';
import ClubBadge from '../../../components/ClubBadge';
import GameTabLink from '../GameTabLink';

/** Tabelhovedet, der hører til rækken — samme kolonner, samme skjul på mobil. */
export function TabelHoved() {
  return (
    <thead>
      <tr>
        <th className="sltab__rank">#</th>
        <th className="sltab__team">Hold</th>
        <th title="Kampe">K</th>
        <th className="sltab__hide-sm" title="Vundet">V</th>
        <th className="sltab__hide-sm" title="Uafgjort">U</th>
        <th className="sltab__hide-sm" title="Tabt">T</th>
        <th className="sltab__hide-sm" title="Mål">Mål</th>
        <th title="Målforskel">±</th>
        <th className="sltab__pts" title="Point">P</th>
      </tr>
    </thead>
  );
}

export default function TabelRaekke({ r, teams, maerke = null, className, ...rest }) {
  const info = teamInfo(teams, r.teamName);
  const gd = (Number(r.gf) || 0) - (Number(r.ga) || 0);
  return (
    <tr className={className} data-delt={r.delt ? 'true' : undefined} {...rest}>
      <td className="sltab__rank">{r.rank ?? ''}</td>
      <td className="sltab__team">
        <span className="sltab__teamcell">
          <ClubBadge
            variant="troeje" code={r.teamShortName || info?.short} color={info?.color} size={22}
            color2={info?.troejer?.hjemme?.sekundaer} moenster={info?.troejer?.hjemme?.moenster}
            aerme={info?.troejer?.hjemme?.aerme} flag={info?.flag} title={r.teamName}
          />
          {/* Tabelrækken er den mest naturlige indgang til en holdside.
              Kortkoden kommer fra HOLDLISTEN (info.short), ikke fra API'ets
              teamShortName: URL'en skal matche spillets egen nøgle, og de to
              kan afvige. Uden kortkode intet link — aldrig et link bygget af
              et holdnavn med mellemrum. */}
          {info?.short ? (
            <GameTabLink fane="elo" hold={info.short} className="sltab__name">
              {info?.vis || r.teamName}
            </GameTabLink>
          ) : (
            <span className="sltab__name">{info?.vis || r.teamName}</span>
          )}
          {maerke}
        </span>
      </td>
      <td>{r.played}</td>
      <td className="sltab__hide-sm">{r.won}</td>
      <td className="sltab__hide-sm">{r.draw}</td>
      <td className="sltab__hide-sm">{r.lost}</td>
      <td className="sltab__hide-sm">{r.gf}-{r.ga}</td>
      <td>{gd > 0 ? `+${gd}` : gd}</td>
      <td className="sltab__pts">{r.points}</td>
    </tr>
  );
}

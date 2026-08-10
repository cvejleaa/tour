/**
 * SuperligaTable — den OFFICIELLE grundspils-stilling, hentet fra api.superliga.dk
 * (games/{gameId}.standings, synket af serveren). Vi beregner den ikke selv.
 * Viser mesterskabsspil (top 6) og nedrykningsspil (bund 6) adskilt.
 */
import { teamsOf, teamInfo } from './teamInfo';
import ClubBadge from '../../../components/ClubBadge';

const POOL_SIZE = 6;

function Row({ r, teams }) {
  const info = teamInfo(teams, r.teamName);
  const gd = (Number(r.gf) || 0) - (Number(r.ga) || 0);
  return (
    <tr>
      <td className="sltab__rank">{r.rank}</td>
      <td className="sltab__team">
        <span className="sltab__teamcell">
          <ClubBadge
            variant="troeje" code={r.teamShortName || info?.short} color={info?.color} size={22}
            color2={info?.troejer?.hjemme?.sekundaer} moenster={info?.troejer?.hjemme?.moenster}
            aerme={info?.troejer?.hjemme?.aerme} title={r.teamName}
          />
          <span className="sltab__name">{r.teamName}</span>
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

export default function SuperligaTable({ game }) {
  // Spillets egne hold — ellers får engelske klubber hverken farve eller
  // kortkode, fordi opslaget lå fast i den danske liste.
  const hold = teamsOf(game);
  const standings = Array.isArray(game?.standings) ? [...game.standings].sort((a, b) => a.rank - b.rank) : [];

  if (standings.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">⚽</div>
        <div className="empty-state__title">Stillingen er ikke klar endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>
          Den officielle grundspils-stilling hentes fra Superligaen, så snart sæsonen er i gang.
        </p>
      </div>
    );
  }

  const champ = standings.filter((r) => r.rank <= POOL_SIZE);
  const releg = standings.filter((r) => r.rank > POOL_SIZE);

  const Section = ({ title, rows, tone }) => (
    <>
      <tr className={`sltab__divider sltab__divider--${tone}`}>
        <td colSpan={9}>{title}</td>
      </tr>
      {rows.map((r) => <Row key={r.teamName} r={r} teams={hold} />)}
    </>
  );

  return (
    <div>
      <div className="card mb-2">
        <h3 className="card__title">⚽ Superligaen — grundspil</h3>
        <p style={{ color: 'var(--c-muted)', margin: 0 }}>
          Officiel stilling fra Superligaen. Efter grundspillet spiller de <strong>øverste 6</strong> om
          mesterskabet og de <strong>nederste 6</strong> i nedrykningsspillet — det er dem, pulje-tippet handler om.
        </p>
      </div>
      <div className="sltab-wrap">
        <table className="sltab">
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
          <tbody>
            <Section title={`🏆 Mesterskabsspil (top ${POOL_SIZE})`} rows={champ} tone="champ" />
            <Section title={`⬇️ Nedrykningsspil (bund ${POOL_SIZE})`} rows={releg} tone="releg" />
          </tbody>
        </table>
      </div>
      {game.standingsSyncedAt && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Kilde: api.superliga.dk · opdateres automatisk.
        </p>
      )}
    </div>
  );
}

/**
 * FootballTable — den OFFICIELLE liga-stilling (games/{gameId}.standings,
 * synket af serveren). Vi beregner den ikke selv.
 *
 * Visningen følger spil-dokumentet, ikke komponenten: DELINGEN i mesterskabs-/
 * nedrykningsspil styres af pulje-konfigurationens tabelDeling (Superligaens
 * liga-FORMAT deler sig faktisk; {poolSize:6} normaliseres til deling). En
 * pulje alene deler IKKE tabellen: PL-puljen (top 4/bund 3) er et sæson-tip,
 * ikke et format — uden tabelDeling vises én flad tabel med nedrykningsstreg
 * (QC-fund: puljen på PL må ikke flippe hele Tabel-fanen).
 */
import { teamsOf, teamInfo } from './teamInfo';
import { puljeKonfig } from '../../../lib/superligaScoring';
import ClubBadge from '../../../components/ClubBadge';
import GameTabLink from '../GameTabLink';

// Hvor mange hold der rykker ud af en liga uden slutspilsdeling. En engelsk
// kendsgerning (PL rykker altid 3 ned) — men regnet fra bunden af tabellen,
// ikke fra et hardcodet rank-tal, så tabellens størrelse ikke er indbagt.
const NEDRYK = 3;

// Kildelinjen siger, hvor stillingen kommer FRA. Ukendt provider ⇒ ingen
// linje: en gættet kilde er værre end ingen.
const KILDER = { superliga: 'api.superliga.dk', pulselive: 'premierleague.com' };

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

export default function FootballTable({ game }) {
  // Spillets egne hold — ellers får engelske klubber hverken farve eller
  // kortkode, fordi opslaget lå fast i den danske liste.
  const hold = teamsOf(game);
  const standings = Array.isArray(game?.standings) ? [...game.standings].sort((a, b) => a.rank - b.rank) : [];

  if (standings.length === 0) {
    // Fanen er gated på, at standings findes (GamePage), så hertil når man
    // kun via et direkte link (?fane=tabel). Teksten lover derfor ingen
    // automatik — for et spil uden synk-provider ville det være usandt.
    return (
      <div className="empty-state">
        <div className="empty-state__icon">⚽</div>
        <div className="empty-state__title">Stillingen er ikke klar endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>
          Den officielle stilling vises her, når den er hentet.
        </p>
      </div>
    );
  }

  const konfig = puljeKonfig(game);
  const poolSize = konfig && konfig.tabelDeling ? konfig.poolSize : 0;
  const kilde = KILDER[game?.sync?.provider];

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
      {poolSize ? (
        <div className="card mb-2">
          <h3 className="card__title">⚽ Superligaen — grundspil</h3>
          <p style={{ color: 'var(--c-muted)', margin: 0 }}>
            Officiel stilling fra Superligaen. Efter grundspillet spiller de <strong>øverste {poolSize}</strong> om
            mesterskabet og de <strong>nederste {poolSize}</strong> i nedrykningsspillet — det er dem, pulje-tippet handler om.
          </p>
        </div>
      ) : (
        <div className="card mb-2">
          <h3 className="card__title">⚽ Officiel stilling</h3>
          <p style={{ color: 'var(--c-muted)', margin: 0 }}>
            Ligaens officielle stilling. De <strong>nederste {NEDRYK}</strong> rykker ned.
          </p>
        </div>
      )}
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
            {poolSize ? (
              <>
                <Section
                  title={`🏆 Mesterskabsspil (top ${poolSize})`}
                  rows={standings.filter((r) => r.rank <= poolSize)} tone="champ"
                />
                <Section
                  title={`⬇️ Nedrykningsspil (bund ${poolSize})`}
                  rows={standings.filter((r) => r.rank > poolSize)} tone="releg"
                />
              </>
            ) : (
              // Stregen tegnes kun, når tabellen faktisk har hold OVER den —
              // en halv-synket tabel må ikke vise alle hold som nedrykkere.
              <>
                {standings.filter((r) => standings.length <= NEDRYK || r.rank <= standings.length - NEDRYK)
                  .map((r) => <Row key={r.teamName} r={r} teams={hold} />)}
                {standings.length > NEDRYK && (
                  <Section
                    title={`⬇️ Nedrykning (bund ${NEDRYK})`}
                    rows={standings.filter((r) => r.rank > standings.length - NEDRYK)} tone="releg"
                  />
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
      {game.standingsSyncedAt && kilde && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Kilde: {kilde} · opdateres automatisk.
        </p>
      )}
    </div>
  );
}

/**
 * GameStandings — rangliste for ét spil. Viser placering, spiller (avatar +
 * navn) og point, med en lille pil for placerings-ændring. Fremhæver den
 * indloggede spiller.
 */
import { useMemo, useState } from 'react';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useVisibleGameStandings } from './useVisibleGameStandings';
import { rankDelta, subsetRanking } from './gameStandings';
import GameTabLink from './GameTabLink';
import { formatPoints } from './GameLayout';
import { RUBRIKKER } from './football/PointOpdeling';
import SpillerDetalje from './football/SpillerDetalje';

// Værdien for "vis alle mine ligaer samlet". Tom streng ville kollidere med
// et manglende valg.
const ALLE = '__alle__';

/**
 * Opdelingen for hele feltet. Kolonnerne bygges af SAMME RUBRIKKER-liste som
 * kort-visningen — ét sted at ændre rækkefølge og ord. Ellers hedder det
 * "Chancen" det ene sted og noget andet det andet om et halvt år.
 */
function OpdelingsTabel({ rows, meUid }) {
  const harNogen = rows.some((r) => r.opdeling);
  return (
    <div className="table-wrap">
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Spiller</th>
            {RUBRIKKER.map(({ key, ikon, navn, hjaelp }) => (
              <th key={key} title={hjaelp} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span aria-hidden="true">{ikon}</span> {navn}
              </th>
            ))}
            <th style={{ textAlign: 'right' }}>I alt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uid} className={r.uid === meUid ? 'row--me' : undefined}>
              <td>{r.rank}. {r.name}</td>
              {RUBRIKKER.map(({ key }) => (
                <td key={key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {/* En streg og ikke et nul: findes opdelingen ikke endnu, har
                      vi ikke tallet — vi ved ikke, at det er nul. */}
                  {r.opdeling ? formatPoints(r.opdeling[key] ?? 0) : '–'}
                </td>
              ))}
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatPoints(r.totalPoints)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!harNogen && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
          Opdelingen bygges, næste gang en kamp afgøres. Totalen er der allerede.
        </p>
      )}
    </div>
  );
}

function DeltaArrow({ row }) {
  const d = rankDelta(row);
  if (d == null || d === 0) return null;
  const up = d > 0;
  return (
    <span
      title={up ? `Rykket ${d} op` : `Rykket ${-d} ned`}
      style={{ color: up ? 'var(--c-pitch)' : 'var(--c-err)', fontSize: '0.75rem', marginLeft: 4 }}
    >
      {up ? `▲${d}` : `▼${-d}`}
    </span>
  );
}

export default function GameStandings({ gameId, game = null, matches = [] }) {
  const { user } = useAuth();
  const { standings: alleMine, leagues, leagueCount, loading, error } = useVisibleGameStandings(gameId);

  // Filter: hele kredsen (alle mine ligaer samlet) eller én enkelt liga.
  const [leagueId, setLeagueId] = useState(ALLE);
  // Slået fra som udgangspunkt: stillingen skal svare på "hvem fører", ikke
  // stille et regnskab op.
  const [visOpdeling, setVisOpdeling] = useState(false);
  // Hvilken spiller er foldet ud? Kun én ad gangen — to paneler side om side
  // ville hver hente sit dokument og fylde skærmen.
  const [aabenUid, setAabenUid] = useState(null);
  // Er ligaen forsvundet under fødderne på en (forladt, slettet), falder vi
  // tilbage til alle — hellere end en tom tabel uden forklaring.
  const valgt = leagues.find((l) => l.id === leagueId) || null;
  const standings = useMemo(
    () => (valgt ? subsetRanking(alleMine, valgt.memberUids) : alleMine),
    [alleMine, valgt],
  );

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;
  if (error) return <p className="badge badge--red">{error}</p>;

  // Måles på HELE kredsen, ikke på det filtrerede resultat: ellers ville en
  // tom liga skjule selve filteret, og man kunne ikke vælge sig tilbage.
  if (alleMine.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏆</div>
        <div className="empty-state__title">Ingen deltagere endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>Stillingen fyldes, når spillere tilmelder sig og tipper.</p>
      </div>
    );
  }

  // Ranglisten er jeres indbyrdes opgør: kun spillere fra dine egne ligaer.
  if (leagueCount === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">👥</div>
        <div className="empty-state__title">Du er ikke med i en liga endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>
          Ranglisten viser kun de spillere, du deler liga med. Opret eller tilmeld dig
          en liga — så dukker de andre op her.
        </p>
        <p style={{ marginTop: '0.6rem' }}>
          <GameTabLink fane="ligaer" className="btn btn--sm">👥 Gå til Ligaer</GameTabLink>
        </p>
      </div>
    );
  }

  const meUid = user?.uid;
  const hasPodium = standings.length >= 3;
  const podium = hasPodium ? standings.slice(0, 3) : [];
  const listRows = hasPodium ? standings.slice(3) : standings;
  const meRow = standings.find((r) => r.uid === meUid);
  const meInList = meRow && (!hasPodium || meRow.rank > 3);

  const Row = ({ r, sticky = false }) => {
    const isMe = r.uid === meUid;
    return (
      <tr
        className={sticky ? 'rank-row--me' : ''}
        style={{
          borderTop: '1px solid var(--c-border)',
          background: isMe && !sticky ? 'var(--c-surface-alt)' : undefined,
          fontWeight: isMe ? 700 : 400,
        }}
      >
        <td style={{ padding: '0.45rem 0.5rem', fontVariantNumeric: 'tabular-nums', width: 52 }}>
          {r.rank}<DeltaArrow row={r} />
        </td>
        <td style={{ padding: '0.45rem 0.5rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Avatar uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam} size={26} />
            {/* Navnet er klikbart, fordi rækken KOM fra en liga-filtreret kilde:
                useVisibleGameStandings viser kun folk, man deler liga med (plus
                sig selv), og det er nøjagtig samme afgrænsning som reglen på
                detalje-dokumentet. Vises navne et andet sted uden den garanti,
                må de ikke gøres klikbare — så ville linket åbne et panel med en
                tilladelses-fejl. */}
            <button
              type="button"
              className="link-btn"
              onClick={() => setAabenUid((u) => (u === r.uid ? null : r.uid))}
              aria-expanded={aabenUid === r.uid}
            >
              {r.name}
            </button>
            {isMe && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
          </span>
        </td>
        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatPoints(r.totalPoints)}
        </td>
      </tr>
    );
  };

  // Bestemt form i flertal er med vilje: listen trunkeres aldrig, så "de N
  // spillere" siger korrekt, at det er dem alle. Ved ÉN spiller er det én selv
  // — man deler ikke liga med sig selv, så den sætning skal skrives om.
  const antal = standings.length;
  const opsummering = valgt
    ? (antal === 1
      ? `Viser 1 spiller i ${valgt.name || 'ligaen'}.`
      : `Viser de ${antal} spillere i ${valgt.name || 'ligaen'}.`)
    : (antal === 1
      ? 'Viser kun dig selv — ingen andre i dine ligaer er med endnu.'
      : `Viser de ${antal} spillere, du deler liga med.`);

  // Opdelingen viser HELE feltet — også de tre på podiet. Byggede den på
  // listRows, ville regnskabet mangle netop de spillere, man helst vil se
  // tallene bag.
  const alleRaekker = standings;

  // Slå den åbne spiller op i de SYNLIGE rækker. Forsvinder han (liga skiftet,
  // filter ændret), lukker panelet af sig selv i stedet for at hænge med data,
  // man ikke længere må se.
  const aabenRow = aabenUid ? standings.find((r) => r.uid === aabenUid) : null;

  const MEDAL = ['🥇', '🥈', '🥉'];
  // Podie-rækkefølge: 2. plads, 1. plads (løftet), 3. plads.
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;

  return (
    <div>
      {/* Filteret vises kun, når der er noget at vælge imellem: med én liga
          er "alle mine ligaer" og den ene liga det samme. */}
      {leagueCount > 1 && (
        <label style={{ display: 'block', margin: '0 0 0.6rem' }}>
          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--c-muted)', marginBottom: '0.2rem' }}>
            Vis stilling for
          </span>
          <select
            value={valgt ? valgt.id : ALLE}
            onChange={(e) => setLeagueId(e.target.value)}
            style={{ width: '100%', maxWidth: '18rem' }}
            aria-label="Vis stilling for"
          >
            <option value={ALLE}>Alle mine ligaer</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name || 'Liga uden navn'}</option>
            ))}
          </select>
        </label>
      )}

      <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', margin: '0 0 0.6rem' }}>
        {opsummering}
        {/* Har man valgt en liga, står man typisk og vil videre TIL den —
            væggen, spørgsmålene, medlemmerne. */}
        {valgt && (
          <>
            {' '}
            <GameTabLink fane="ligaer" liga={valgt.id}>Åbn ligaen →</GameTabLink>
          </>
        )}
      </p>
      {hasPodium && (
        <div className="podium">
          {podiumOrder.map((r) => (
            <div key={r.uid} className={`podium__spot podium__spot--${r.rank}`}>
              <span className="podium__medal">{MEDAL[r.rank - 1] || `#${r.rank}`}</span>
              <Avatar uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam} size={r.rank === 1 ? 40 : 32} />
              <span className="podium__name">{r.name}</span>
              <span className="podium__pts">{formatPoints(r.totalPoints)} p</span>
            </div>
          ))}
        </div>
      )}

      {standings.length === 0 && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
          Ingen af ligaens medlemmer er med i stillingen endnu.
        </p>
      )}

      {listRows.length > 0 && (
        <>
          {/* Opdelingen er en EGEN visning, ikke en udvidelse af stillingen.
              Seks tal pr. række ville drukne en liste, der har tre kolonner på
              mobil — og podiet har plads til nøjagtig ét tal. Derfor en knap,
              der bytter tabellen ud, og som er slået fra som udgangspunkt. */}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-pressed={visOpdeling}
            onClick={() => setVisOpdeling((v) => !v)}
            style={{ marginBottom: '0.5rem' }}
          >
            {visOpdeling ? '🏆 Vis stillingen' : '🧮 Udspecificér pointene'}
          </button>

          {visOpdeling ? (
            <OpdelingsTabel rows={alleRaekker} meUid={meUid} />
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {listRows.map((r) => <Row key={r.uid} r={r} />)}
                {meInList && meRow && !listRows.some((r) => r.uid === meUid) && (
                  <Row r={meRow} sticky />
                )}
              </tbody>
            </table>
          )}

          {aabenRow && (
            <SpillerDetalje
              game={game}
              matches={matches}
              spiller={aabenRow}
              onLuk={() => setAabenUid(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

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

// Værdien for "vis alle mine ligaer samlet". Tom streng ville kollidere med
// et manglende valg.
const ALLE = '__alle__';

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

export default function GameStandings({ gameId }) {
  const { user } = useAuth();
  const { standings: alleMine, leagues, leagueCount, loading, error } = useVisibleGameStandings(gameId);

  // Filter: hele kredsen (alle mine ligaer samlet) eller én enkelt liga.
  const [leagueId, setLeagueId] = useState(ALLE);
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
            {r.name}{isMe && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
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
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {listRows.map((r) => <Row key={r.uid} r={r} />)}
            {meInList && meRow && !listRows.some((r) => r.uid === meUid) && (
              <Row r={meRow} sticky />
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

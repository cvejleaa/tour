/**
 * GameStandings — rangliste for ét spil. Viser placering, spiller (avatar +
 * navn) og point, med en lille pil for placerings-ændring. Fremhæver den
 * indloggede spiller.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useVisibleGameStandings } from './useVisibleGameStandings';
import { rankDelta, subsetRanking } from './gameStandings';
import GameTabLink from './GameTabLink';
import { formatPoints } from './GameLayout';
import { fmtSignedPoints } from '../../lib/daNum';
import { RUBRIKKER, opdelingsAfvigelse, afvigelsesTekst } from './football/PointOpdeling';
import SpillerDetalje from './football/SpillerDetalje';

// Værdien for "vis alle mine ligaer samlet". Tom streng ville kollidere med
// et manglende valg.
const ALLE = '__alle__';

/**
 * Navnet som knap. ÉT sted, fordi navne står tre steder — på podiet, i listen
 * og i opdelingstabellen — og alle tre skal åbne det samme panel. Var podiet
 * ikke klikbart, kunne man ikke åbne detaljen på nummer ét: præcis den
 * spiller, man vil kigge efter i sømmene.
 *
 * Navnet er klikbart, fordi rækken KOM fra en liga-filtreret kilde:
 * useVisibleGameStandings viser kun folk, man deler liga med (plus sig selv),
 * og det er nøjagtig samme afgrænsning som reglen på detalje-dokumentet.
 * Vises navne et andet sted uden den garanti, må de ikke gøres klikbare — så
 * ville linket åbne et panel med en tilladelses-fejl.
 */
function SpillerNavn({ r, aaben, onToggle, className = 'link-btn' }) {
  return (
    <button type="button" className={className} onClick={() => onToggle(r.uid)} aria-expanded={aaben}>
      {r.name}
    </button>
  );
}

/**
 * Opdelingen for hele feltet. Kolonnerne bygges af SAMME RUBRIKKER-liste som
 * kort-visningen — ét sted at ændre rækkefølge og ord. Ellers hedder det
 * "Chancen" det ene sted og noget andet det andet om et halvt år.
 */
function OpdelingsTabel({ rows, meUid, aabenUid, onToggle }) {
  const harNogen = rows.some((r) => r.opdeling);
  // Afvigelserne regnes med SAMME funktion som kortet, så noten siger det
  // samme begge steder. I en tabel med 22 rækker kan sætningen ikke stå ved
  // hver række — derfor en stjerne på totalen og forklaringen under tabellen.
  const afvigelser = rows.map((r) => opdelingsAfvigelse(r.opdeling, r.totalPoints));
  const foersteAfvigelse = afvigelser.find(Boolean) || null;
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
          {rows.map((r, i) => {
            const isMe = r.uid === meUid;
            return (
              <tr
                key={r.uid}
                // Fremhævningen skrives her og ikke som en klasse: `.row--me`
                // fandtes ikke i noget stylesheet, så din egen række så ud som
                // alle andre — i et felt på 22 med seks talkolonner kunne man
                // ikke finde sig selv.
                style={{ background: isMe ? 'var(--c-surface-alt)' : undefined, fontWeight: isMe ? 700 : 400 }}
              >
                <td>
                  {r.rank}.{' '}
                  <SpillerNavn r={r} aaben={aabenUid === r.uid} onToggle={onToggle} />
                  {isMe && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
                </td>
                {RUBRIKKER.map(({ key }) => (
                  <td key={key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {/* En streg og ikke et nul: findes opdelingen ikke endnu, har
                        vi ikke tallet — vi ved ikke, at det er nul. */}
                    {r.opdeling
                      ? (key === 'chance'
                        ? fmtSignedPoints(r.opdeling[key] ?? 0)
                        : formatPoints(r.opdeling[key] ?? 0))
                      : '–'}
                  </td>
                ))}
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {formatPoints(r.totalPoints)}
                  {afvigelser[i] && <span title={afvigelsesTekst(afvigelser[i])}>*</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Kolonneoverskrifternes title-tekst findes ikke på en telefon — der er
          ingen mus at holde stille. Derfor står forklaringen også som tekst. */}
      <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
        {RUBRIKKER.map(({ ikon, navn, hjaelp }) => `${ikon} ${navn}: ${hjaelp}`).join(' ')}
      </p>
      {foersteAfvigelse && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
          * Delene summer ikke til totalen. Totalen er den rigtige — enten fordi saldoen
          ikke kan gå i minus, eller fordi en kamp ikke kunne læses i opdelingen.
        </p>
      )}
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
  const panelRef = useRef(null);

  // Rul til panelet, når det åbnes. Uden det ser et klik på en spiller langt
  // nede i listen ud, som om der ikke skete noget. Hooken står før de tidlige
  // returneringer, fordi hooks ikke må springes over.
  useEffect(() => {
    if (!aabenUid) return;
    const el = panelRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [aabenUid]);

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
  const toggleUid = (uid) => setAabenUid((u) => (u === uid ? null : uid));
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
            <SpillerNavn r={r} aaben={aabenUid === r.uid} onToggle={toggleUid} />
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

      {/* Overskriftslinjen er en VÆRKTØJSLINJE: hvem vises, og hvordan.
          Knappen til opdelingen stod før mellem podiet og listen, hvor den
          delte stillingen i to og lignede en overskrift for den nederste
          halvdel. Den skifter visning for hele fanen og hører derfor øverst. */}
      <div className="standings__bar">
        <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', margin: 0 }}>
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
        {/* Opdelingen er en EGEN visning, ikke en udvidelse af stillingen.
            Seks tal pr. række ville drukne en liste, der har tre kolonner på
            mobil — og podiet har plads til nøjagtig ét tal. Derfor en knap,
            der bytter tabellen ud, og som er slået fra som udgangspunkt.

            Betingelsen er `standings`, IKKE `listRows`. En liga med præcis tre
            spillere fylder podiet og har en tom liste — og så forsvandt både
            knappen og spillerdetaljen for hele den gruppe. */}
        {standings.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-pressed={visOpdeling}
            onClick={() => setVisOpdeling((v) => !v)}
          >
            {/* "Tilbage til listen" og ikke "vis stillingen": man ER i
                stillingen, og podiet står uændret ovenover hele tiden. */}
            {visOpdeling ? '← Tilbage til listen' : '🧮 Hvor kommer pointene fra?'}
          </button>
        )}
      </div>

      {hasPodium && (
        <div className="podium">
          {podiumOrder.map((r) => (
            <div key={r.uid} className="podium__spot">
              <span className="podium__medal">{MEDAL[r.rank - 1] || `#${r.rank}`}</span>
              <Avatar uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam} size={r.rank === 1 ? 44 : 34} />
              <SpillerNavn r={r} aaben={aabenUid === r.uid} onToggle={toggleUid} className="link-btn podium__name" />
              <span className="podium__pts">{formatPoints(r.totalPoints)} p</span>
              {/* Selve trinnet. Højden følger PLACERINGEN og ikke pladsen i
                  rækken: står tre spillere lige, har de alle rang 1 og skal
                  stå i samme højde. Et podie, der løfter én af tre lige
                  spillere, ville lyve om stillingen. */}
              <div className={`podium__trin podium__trin--${Math.min(r.rank, 3)}`}>
                <span className="podium__plads">{r.rank}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {standings.length === 0 && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
          Ingen af ligaens medlemmer er med i stillingen endnu.
        </p>
      )}

      {/* Betingelsen er `standings`, IKKE `listRows`. En liga med præcis tre
          spillere fylder podiet og har en tom liste — og så forsvandt både
          opdelingen og spillerdetaljen for hele den gruppe. */}
      {standings.length > 0 && (
        <>
          {visOpdeling ? (
            <OpdelingsTabel
              rows={alleRaekker}
              meUid={meUid}
              aabenUid={aabenUid}
              onToggle={toggleUid}
            />
          ) : (
            listRows.length > 0 && (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {listRows.map((r) => <Row key={r.uid} r={r} />)}
                  {meInList && meRow && !listRows.some((r) => r.uid === meUid) && (
                    <Row r={meRow} sticky />
                  )}
                </tbody>
              </table>
            )
          )}

          {/* Panelet står under HELE tabellen. Klikkede man på nr. 12 af 22,
              skete der tilsyneladende ingenting — derfor rulles der derhen. */}
          <div ref={panelRef}>
            {aabenRow && (
              <SpillerDetalje
                game={game}
                matches={matches}
                spiller={aabenRow}
                onLuk={() => setAabenUid(null)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

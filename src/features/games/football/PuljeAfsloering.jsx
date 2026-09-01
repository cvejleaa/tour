// ---------------------------------------------------------------------------
// Puljens afsløring — vises KUN når tippet er låst.
//
// Reglerne har siden længe tilladt, at spillets deltagere ser hinandens
// pulje-tip efter deadline, men ingen klient brugte det: puljen var et
// solo-væddemål, og reveal-øjeblikket var bygget uden aftager. Tallene regnes
// i puljeAfsloering.js; her hentes dokumenterne og tegnes.
//
// TO VISNINGER, MED HVER SIN KREDS:
//
//  * "Sådan tippede I" — én række pr. HOLD, uden navne og uden rangering,
//    regnet på HELE spillet. Konsensus og enegængere i samme billede, ingen
//    udfoldninger (Spilfører-fund: "3 af 6" er et tal, picksene er en holdning).
//    Uden navne og rangering findes hverken liga-artefakten, etrækkeren ved
//    nul ligaer eller udfoldningerne fra opgave #60.
//
//  * "Sådan står puljen" — rangliste pr. spiller, for ÉN liga ad gangen.
//    Aldrig unionen af mine ligaer: en rangliste dér matcher INGEN ligas
//    stilling, og den fejl er sket før (gameRecap.js). Under to liga-fæller
//    vises den ikke — en etrækkers "rangliste" over én selv er værre end
//    ingenting.
//
// LÆSES MED getDocs, IKKE onSnapshot. En lytter tegnet før deadline fejler
// permanent og heler ikke sig selv, når deadline passeres (Security-fund).
// Og reglen bruger serverens ur, klienten sit eget: et ur et minut foran får
// permission-denied. Så fejler vi STILLE — ingen rød alarm for en tilstand,
// der retter sig selv om et minut.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import { COL } from '../../../lib/constants';
import ClubBadge from '../../../components/ClubBadge';
import { useGameStandings } from '../useGameStandings';
import { fmtPoints } from '../../../lib/daNum';
import {
  erAfgjort, holdTilslutning, puljeRangliste, puljeVindere,
} from './puljeAfsloering';

/**
 * En enegænger blandt to tip er en mønt, ikke en bedrift. Samme tærskel som
 * `ENSOM_MINIMUM` i LeagueBets.jsx — én regel for "hvornår er alene noget".
 */
export const ENEGAENGER_MINIMUM = 3;

/**
 * Sætningen ved en enegænger. Navnet må KUN nævnes, når personen er en
 * liga-fælle — det er synlighedsmodellens grænse. Ellers "kun én spiller":
 * aggregatet er spillets, navnene er ligaens.
 */
export function enegaengerTekst(enesteUid, uid, navnAf) {
  if (!enesteUid) return null;
  if (enesteUid === uid) return 'kun dig';
  const navn = navnAf(enesteUid);
  return navn ? `kun ${navn}` : 'kun én spiller';
}

export default function PuljeAfsloering({
  gameId, uid, teams, konfig, facitTop, ligeNuTop,
}) {
  // undefined = henter · [] = ingen tip ELLER må ikke læse. De to sidste er
  // med vilje SAMME tilstand: begge skal tie, og ingen læser forskellen.
  // Første udgave holdt dem adskilt (null/[]), og mutationen "behandl fejl
  // som tom liste" overlevede — fordi den var ækvivalent.
  const [bets, setBets] = useState(undefined);
  const { standings, leagues } = useGameStandings(gameId);
  const [ligaId, setLigaId] = useState(null);

  useEffect(() => {
    if (!gameId) return undefined;
    let aktiv = true;
    getDocs(collection(db, COL.GAMES, gameId, COL.GAME_PULJE))
      .then((snap) => { if (aktiv) setBets(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))); })
      .catch(() => { if (aktiv) setBets([]); });   // stille — se toppen
    return () => { aktiv = false; };
  }, [gameId]);

  const afgjort = erAfgjort(bets);
  // ÉN KILDE: er puljen afgjort, bruges det endelige facit; ellers "lige nu".
  const topHold = afgjort ? (facitTop || null) : (ligeNuTop || null);
  const topSet = useMemo(() => (topHold instanceof Set ? topHold : new Set(topHold || [])), [topHold]);

  const navnAf = (u) => standings.find((s) => s.uid === u)?.name || null;

  // Ligaen, der rangeres i. Ingen "alle mine ligaer"-mulighed — se toppen.
  const valgtLiga = useMemo(() => {
    if (!leagues.length) return null;
    return leagues.find((l) => l.id === ligaId) || leagues[0];
  }, [leagues, ligaId]);
  const medlemmer = useMemo(() => {
    if (!valgtLiga) return [];
    const ids = new Set(valgtLiga.memberUids || []);
    return standings.filter((s) => ids.has(s.uid)).map((s) => ({ uid: s.uid, name: s.name }));
  }, [valgtLiga, standings]);

  if (!bets?.length) return null; // henter, må ikke læse, eller ingen har tippet — tie

  const valg = { antal: konfig.poolSize, perTeam: konfig.perTeam, perfectBonus: konfig.perfectBonus };
  const hold = holdTilslutning(bets, teams).filter((h) => h.antal > 0);
  const antalTip = bets.length;
  const raekker = medlemmer.length >= 2
    ? puljeRangliste(bets, medlemmer, topSet, valg, afgjort)
    : null;
  const vindere = afgjort && raekker ? puljeVindere(raekker) : null;

  return (
    <div className="mb-2" data-testid="pulje-afsloering">
      {/* KREDSEN SIGES ÆRLIGT. Reglen giver spillets deltagere adgang, ikke kun
          liga-fæller — og gaten er en afgrænsning, ikke en fortrolighedsgrænse
          (Security-fund: players-create har ingen vagt på spillets tilstand).
          Der loves derfor ikke "kun din liga kan se dette". */}
      <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0.75rem 0 0.35rem' }}>
        Efter deadline er puljen åben for alle i spillet.
      </p>

      <h4 style={{ margin: '0.6rem 0 0.35rem' }}>Sådan tippede I</h4>
      <table className="table" style={{ width: '100%' }} data-testid="pulje-holdtabel">
        <tbody>
          {hold.map((h) => {
            const t = teams.find((x) => x.name === h.navn);
            const ene = antalTip >= ENEGAENGER_MINIMUM ? enegaengerTekst(h.enesteUid, uid, navnAf) : null;
            return (
              <tr key={h.navn}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {t && (
                    <ClubBadge
                      variant="troeje" code={t.short} color={t.color} size={20}
                      color2={t.troejer?.hjemme?.sekundaer} moenster={t.troejer?.hjemme?.moenster}
                      aerme={t.troejer?.hjemme?.aerme} title={t.name}
                    />
                  )}
                  {' '}{t?.vis || h.navn}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <strong>{h.antal} af {antalTip}</strong>
                  {topSet.has(h.navn) && <span title={afgjort ? 'Facit' : 'Står der lige nu'}> 🏆</span>}
                </td>
                <td style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
                  {ene && <>— {ene}</>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {raekker && (
        <>
          <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
            <h4 style={{ margin: '0 0 0.35rem' }}>Sådan står puljen</h4>
            {/* Vælgeren vises kun, når der er noget at vælge imellem. Ingen
                "alle mine ligaer" — en rangliste på unionen matcher ingen ligas
                stilling. */}
            {leagues.length > 1 && (
              <select
                value={valgtLiga?.id || ''}
                onChange={(e) => setLigaId(e.target.value)}
                aria-label="Vis puljen for"
                style={{ maxWidth: '14rem' }}
              >
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>{l.name || 'Liga uden navn'}</option>
                ))}
              </select>
            )}
          </div>
          {vindere && (
            <p className="badge badge--green" style={{ display: 'block' }} data-testid="pulje-vinder">
              🏆 Puljen er afgjort: <strong>{vindere.map((v) => (v.uid === uid ? 'du' : v.navn)).join(' og ')}</strong>
              {' '}vandt med {vindere[0].rigtige} af {konfig.poolSize}
              {vindere[0].rigtige === konfig.poolSize && konfig.perfectBonus > 0 && <> — perfekt række, +{konfig.perfectBonus} bonus</>}
              {' '}(+{fmtPoints(vindere[0].point)} point).
            </p>
          )}
          <ol style={{ margin: 0, paddingLeft: '1.4rem' }} data-testid="pulje-rangliste">
            {raekker.map((r) => (
              <li key={r.uid} style={{ fontWeight: r.uid === uid ? 700 : 400 }}>
                {r.uid === uid ? 'du' : r.navn}
                {' — '}
                {r.tippede
                  ? <>{r.rigtige} af {konfig.poolSize}{afgjort && <> · +{fmtPoints(r.point)}</>}</>
                  : <span style={{ color: 'var(--c-muted)' }}>tippede ikke</span>}
              </li>
            ))}
          </ol>
          {!afgjort && (
            <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
              Lige nu, hvis tabellen sluttede i dag. Intet er afgjort endnu.
            </p>
          )}
        </>
      )}
    </div>
  );
}

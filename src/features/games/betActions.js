/**
 * Firebase-handlinger for tips i ét spil (games/{gameId}/bets/{uid_matchId}).
 *
 * Et fodbold-tip er et 1X2-valg pr. kamp. Kun ikke-point-felter må sættes af
 * spilleren; selve point-afregningen sker server-side (Cloud Function) ud fra
 * kampens facit + frosne odds. Odds gemmes derfor på KAMPEN (ikke på tippet),
 * så en klient ikke kan puste gevinsten op.
 *
 * CHANCEN SKRIVES IKKE HERFRA. `chanceStake` ejes af serveren og sættes gennem
 * callable'en `setGameChance` (se setChance nedenfor). Reglen "én ⚡ pr. runde"
 * er en FORESPØRGSEL — "har du allerede en chance et andet sted i runden?" —
 * og firestore.rules kan ikke køre forespørgsler, kun `get()` på ét kendt
 * dokument. Derfor kunne reglen aldrig håndhæves her.
 *
 * Alle funktioner returnerer { ok: true } | { ok: false, error: 'dansk besked' }.
 */
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { isOutcome } from '../../lib/superligaScoring';

/** Dokument-id for et tip: uid_matchId (ét tip pr. bruger pr. kamp). */
export function betId(uid, matchId) {
  return `${uid}_${matchId}`;
}

function danishError(err, fallback) {
  const code = err?.code || '';
  // "Deadline passeret eller ingen adgang" er den værste besked i hele
  // mekanikken, hvis kampen er ÅBEN: den beskylder spilleren for at være for
  // sen på noget, der ikke er lukket, og han vil tro, spillet er i stykker.
  //
  // Efter at serveren overtog chanceStake, er en forældet fane en ægte og
  // ret sandsynlig årsag: den gamle klient sender `chanceStake: 0` med hvert
  // 1X2-klik, og på et tip oprettet af det nye bundle er fravær → 0 en berørt
  // nøgle, som reglerne afviser. Faner overlever et deploy, og der findes
  // ingen genindlæs-notits i appen endnu (backlog #33).
  if (code === 'permission-denied') {
    return 'Tippet kunne ikke gemmes. Er kampen stadig åben, er siden sandsynligvis '
      + 'forældet — genindlæs og prøv igen. Ellers er deadline passeret.';
  }
  if (code === 'unavailable') return 'Kunne ikke få forbindelse. Prøv igen.';
  return err?.message || fallback;
}

/**
 * Gem/opdatér et 1X2-tip på en kamp.
 * @param {object} o
 * @param {string} o.uid
 * @param {string} o.gameId
 * @param {string} o.matchId
 * @param {'1'|'X'|'2'} o.pick
 * @param {string[]} [o.leagueIds=[]] – mine ligaer i spillet (fra players/{uid});
 *   skrives med på tippet, så liga-kammerater kan se det EFTER kickoff. Reglen
 *   afviser ligaer, man ikke er med i. Tom liste = tippet er kun synligt for
 *   én selv (og admin).
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setBet({ uid, gameId, matchId, pick, leagueIds = [] }) {
  if (!uid) return { ok: false, error: 'Du skal være logget ind.' };
  if (!gameId || !matchId) return { ok: false, error: 'Mangler spil- eller kamp-id.' };
  if (!isOutcome(pick)) return { ok: false, error: 'Vælg 1, X eller 2.' };

  try {
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_BETS, betId(uid, matchId));
    // Hverken `points` eller `chanceStake` sættes her — begge ejes af
    // serveren. `merge: true` lader en chance, serveren har sat, stå urørt,
    // når spilleren retter sit 1X2-valg.
    await setDoc(
      ref,
      {
        uid,
        matchId,
        pick,
        leagueIds: Array.isArray(leagueIds) ? [...new Set(leagueIds.filter(Boolean))] : [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme tippet.') };
  }
}

/**
 * Sæt, flyt eller fjern Chancen ⚡ på ét tip. SERVEREN afgør.
 *
 * HVORFOR EN CALLABLE OG IKKE EN SKRIVNING. Reglen er "én ⚡ pr. runde", og
 * det er en FORESPØRGSEL: har du allerede en chance et andet sted i runden?
 * firestore.rules kan ikke køre forespørgsler — kun `get()` på ét kendt
 * dokument — så reglen har hidtil kun stået i browseren. Hullet: sæt ⚡ på
 * kamp A, lad den låse ved kickoff, sæt den igen på kamp B i samme runde.
 * Begge blev afregnet, for `gameScoring` afregner hvert tip for sig.
 *
 * KLIENTEN NULSTILLER IKKE LÆNGERE SELV. Serveren flytter en åben chance i
 * samme runde i ÉN transaktion og returnerer `flyttetFra`. Det var netop den
 * to-trins nulstilning, der kunne slå fejl halvvejs og efterlade to åbne
 * chancer.
 *
 * TIPPET SKAL FINDES FØRST. Callable'en afviser med `intet-tip`, hvis der
 * ikke er noget 1X2-valg at hænge chancen på. Kalderen skal derfor `await`e
 * sit `setBet` FØR dette kald — se kommentaren i FootballTip.save.
 *
 * `stake` skal være et HELT tal: 0 fjerner chancen, ellers MIN..MAX_ABS.
 * Serveren afviser alt andet; her sendes det bare videre, så der ikke opstår
 * to steder at have reglen.
 *
 * @param {{gameId:string, matchId:string, stake:number}} o
 * @returns {Promise<{ok:true, gruppe:*, indsats:number, matchId:string,
 *                    flyttetFra:string[], uaendret:boolean}
 *                  |{ok:false, error:string}>}
 */
export async function setChance({ gameId, matchId, stake }) {
  if (!gameId || !matchId) return { ok: false, error: 'Mangler spil- eller kamp-id.' };
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../../firebase');
    const fn = httpsCallable(functions, 'setGameChance');
    const res = await fn({ gameId, matchId, stake });
    return { ok: true, ...(res.data || {}) };
  } catch (err) {
    return { ok: false, error: chanceFejl(err) };
  }
}

/**
 * Fejlbeskeden til spilleren.
 *
 * Serveren oversætter allerede sine egne afvisninger til dansk (`chanceFejl` i
 * functions-platform/chanceVagt.js), og de beskeder er præcise — de nævner fx
 * hvilken kamp chancen sidder fast på. Dem sender vi uændret videre.
 *
 * De to koder, der IKKE kommer fra vores egen tabel, får hver sin besked:
 *
 *  - `functions/not-found` betyder, at callable'en ikke er udrullet. Uden
 *    denne gren ville spilleren se en engelsk SDK-streng, og Chancen ville se
 *    ud til at være gået i stykker uden et ord om hvorfor.
 *  - `unavailable` er netværket. Her er det vigtigste IKKE fejlen, men at
 *    intet gik tabt: uden den forsikring tror spilleren, chancen måske ligger
 *    et sted, han ikke kan se, og opdager det først, når runden er afgjort.
 */
function chanceFejl(err) {
  const code = err?.code || '';
  if (code === 'functions/not-found' || code === 'not-found') {
    return 'Chancen kan ikke sættes lige nu (funktionen er ikke udrullet). Prøv igen senere.';
  }
  if (code === 'functions/unavailable' || code === 'unavailable') {
    return 'Ingen forbindelse til serveren. Chancen er uændret — prøv igen.';
  }
  return err?.message || 'Chancen kunne ikke sættes.';
}

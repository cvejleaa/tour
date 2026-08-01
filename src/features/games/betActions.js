/**
 * Firebase-handlinger for tips i ét spil (games/{gameId}/bets/{uid_matchId}).
 *
 * Et fodbold-tip er et 1X2-valg pr. kamp. Valgfrit kan spilleren bruge
 * "Chancen" på ÉN kamp pr. runde: en indsats i point på sit 1X2-valg.
 * Kun ikke-point-felter må sættes af spilleren; selve point-afregningen sker
 * server-side (Cloud Function) ud fra kampens facit + frosne odds. Odds gemmes
 * derfor på KAMPEN (ikke på tippet), så en klient ikke kan puste gevinsten op.
 *
 * Alle funktioner returnerer { ok: true } | { ok: false, error: 'dansk besked' }.
 */
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { isOutcome, isValidStake } from '../../lib/superligaScoring';

/** Dokument-id for et tip: uid_matchId (ét tip pr. bruger pr. kamp). */
export function betId(uid, matchId) {
  return `${uid}_${matchId}`;
}

function danishError(err, fallback) {
  const code = err?.code || '';
  if (code === 'permission-denied') return 'Tippet kunne ikke gemmes (deadline passeret eller ingen adgang).';
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
 * @param {number} [o.chanceStake=0]  – Chancen-indsats (0 = ingen chance)
 * @param {number} [o.bank=0]         – spillerens saldo (til validering af indsats)
 * @param {string[]} [o.leagueIds=[]] – mine ligaer i spillet (fra players/{uid});
 *   skrives med på tippet, så liga-kammerater kan se det EFTER kickoff. Reglen
 *   afviser ligaer, man ikke er med i. Tom liste = tippet er kun synligt for
 *   én selv (og admin).
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setBet({ uid, gameId, matchId, pick, chanceStake = 0, bank = 0, leagueIds = [] }) {
  if (!uid) return { ok: false, error: 'Du skal være logget ind.' };
  if (!gameId || !matchId) return { ok: false, error: 'Mangler spil- eller kamp-id.' };
  if (!isOutcome(pick)) return { ok: false, error: 'Vælg 1, X eller 2.' };

  const stake = Math.max(0, Math.floor(Number(chanceStake) || 0));
  if (stake > 0 && !isValidStake(stake, bank)) {
    return { ok: false, error: 'Ugyldig Chancen-indsats for din saldo.' };
  }

  try {
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_BETS, betId(uid, matchId));
    // points-feltet sættes ALDRIG her — det ejes af serveren.
    await setDoc(
      ref,
      {
        uid,
        matchId,
        pick,
        chanceStake: stake,
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

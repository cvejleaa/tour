// ---------------------------------------------------------------------------
// applyPicksToOpenStages – skriver ÉT sæt holdvalg (de fire spørgsmål) til hver
// etape der stadig er åben for tip (ikke låst/afgjort), i én batched skrivning.
// Skriver ALDRIG til låste/afgjorte etaper og skriver ALDRIG `points`.
// Ren mht. lås-logik (injicerer Date.now via stageStatus) — bruges fra
// StagesPage, der har den fulde etapeliste.
// ---------------------------------------------------------------------------
import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { isTipOpen } from '../../lib/tourStages';
import { STAGE_FIELDS } from '../../lib/tourScoring';

/**
 * Anvend spillerens fire holdvalg på alle åbne etaper.
 * @param {string} uid    spillerens uid
 * @param {{winnerTeam?,gcTeam?,mountainTeam?,sprintTeam?}} picks  de fire holdvalg
 * @param {Array<{id:string, season?:any}>} stages  hele etapelisten
 * @param {number} [now]  injiceres til lås-tjek (default Date.now())
 * @returns {Promise<number>} antal skrevne (åbne) etaper
 */
export async function applyPicksToOpenStages(uid, picks, stages, now = Date.now()) {
  if (!uid) return 0;
  const open = (stages || []).filter((s) => s && s.id && isTipOpen(s, now));
  if (open.length === 0) return 0;

  // Kun de fire kendte tip-felter — aldrig points e.l.
  const cleanPicks = {};
  for (const { key } of STAGE_FIELDS) cleanPicks[key] = picks?.[key] ?? '';

  const batch = writeBatch(db);
  for (const stage of open) {
    batch.set(
      doc(db, COL.STAGE_BETS, `${uid}_${stage.id}`),
      {
        uid,
        stageId: stage.id,
        season: stage.season ?? null,
        ...cleanPicks,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  return open.length;
}

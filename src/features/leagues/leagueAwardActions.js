/**
 * Firebase-handlinger for manuelle liga-point på fælles bonusspørgsmål.
 * Skrivning kræver liga-manager eller global admin (håndhæves af reglerne).
 */
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { awardDocId, normalizeAwards } from './leagueAwards';

/**
 * Gem (eller opdatér) tildelingen for ét fælles bonusspørgsmål i én liga.
 * Et tomt awards-map sletter dokumentet (ingen tildeling tilbage).
 */
export async function saveLeagueBonusAwards({ leagueId, questionId, label, awards, updatedBy }) {
  if (!leagueId || !questionId) throw new Error('Mangler liga eller spørgsmål.');
  if (!updatedBy) throw new Error('Du skal være logget ind.');
  const clean = normalizeAwards(awards);
  const ref = doc(db, COL.LEAGUE_BONUS_AWARDS, awardDocId(leagueId, questionId));
  if (Object.keys(clean).length === 0) {
    await deleteDoc(ref);
    return { deleted: true };
  }
  await setDoc(ref, {
    leagueId,
    questionId,
    label: String(label || '').trim() || null,
    awards: clean,
    updatedBy,
    updatedAt: serverTimestamp(),
  });
  return { saved: Object.keys(clean).length };
}

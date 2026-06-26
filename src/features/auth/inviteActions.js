// Selvbetjent godkendelse via invitationskode.
// Kalder Cloud Function'en redeemInviteCode, som server-side validerer koden mod
// en godkendt liga og — hvis den passer — godkender brugeren og tilmelder ligaen.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/**
 * Indløs en invitationskode for den aktuelt indloggede bruger.
 * @param {string} code
 * @returns {Promise<{ leagueId: string, leagueName: string }>}
 */
export async function redeemInviteCode(code) {
  const fn = httpsCallable(functions, 'redeemInviteCode');
  const res = await fn({ code });
  return res.data;
}

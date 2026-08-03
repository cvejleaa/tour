'use strict';
// ---------------------------------------------------------------------------
// invites.js — server-side kerne for selvbetjent godkendelse via invitationskode.
//
// En ny (endnu ikke godkendt) bruger kan indtaste en ligas join-kode. Lykkes
// opslaget mod en ADMIN-GODKENDT liga, godkendes brugeren (status='approved')
// og tilmeldes ligaen. Hele beslutningen sker server-side (Cloud Function med
// admin-rettigheder) — klienten kan aldrig selv sætte 'approved'.
//
// Denne fil indeholder den rene, testbare logik. Selve Firestore-adgangen
// injiceres via `deps`, så logikken kan enhedstestes uden emulator.
// ---------------------------------------------------------------------------

// Maks. antal mislykkede kode-forsøg pr. bruger inden for tidsvinduet
// (beskytter mod gæt/brute-force af koder).
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 60 * 60 * 1000; // 1 time

/** Normalisér en indtastet kode (trim + versaler). */
function normalizeInviteCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Afgør om et nyt forsøg må udføres ud fra tidligere forsøgs-tilstand.
 * @param {{count?: number, windowStart?: number}|null} attempt
 * @param {number} now  – ms siden epoch
 * @returns {{ allowed: boolean, reset: boolean }} reset=true ⇒ vinduet er udløbet
 */
function checkRateLimit(attempt, now, { max = MAX_ATTEMPTS, windowMs = WINDOW_MS } = {}) {
  if (!attempt || !attempt.windowStart || (now - attempt.windowStart) > windowMs) {
    return { allowed: true, reset: true };
  }
  return { allowed: (attempt.count || 0) < max, reset: false };
}

/**
 * Indløs en invitationskode. Ren orkestrering — al I/O injiceres via deps.
 *
 * deps:
 *   uid                       : brugerens uid
 *   rawCode                   : den indtastede kode
 *   now                       : Date.now()
 *   getAttempt(uid)           : → {count, windowStart} | null
 *   saveAttempt(uid, state)   : gem forsøgs-tilstand
 *   getUserStatus(uid)        : → brugerens nuværende status ('pending'|'approved'|'rejected'|…)
 *   findApprovedLeagueByCode(code) : → {id, name} | null (KUN godkendte ligaer)
 *   approveUserAndJoin({uid, leagueId}) : godkend bruger + tilmeld liga
 *
 * @returns {Promise<{ok:true, leagueId, leagueName} | {ok:false, error, message}>}
 */
async function redeemInviteCodeCore(deps) {
  const {
    uid, rawCode, now,
    getAttempt, saveAttempt, getUserStatus, findApprovedLeagueByCode, approveUserAndJoin,
  } = deps;

  const code = normalizeInviteCode(rawCode);
  if (code.length < 4) {
    return { ok: false, error: 'invalid-argument', message: 'Angiv en gyldig invitationskode.' };
  }

  // En AFVIST bruger må ikke kunne gen-godkende sig selv via en delt kode
  // (ellers omgås moderering). Kun ikke-afviste må indløse.
  if (getUserStatus) {
    const status = await getUserStatus(uid);
    if (status === 'rejected') {
      return { ok: false, error: 'permission-denied', message: 'Din adgang er afvist. Kontakt en administrator.' };
    }
  }

  // Rate-limiting: bloker ved for mange mislykkede forsøg.
  const attempt = await getAttempt(uid);
  const rl = checkRateLimit(attempt, now);
  if (!rl.allowed) {
    return { ok: false, error: 'resource-exhausted', message: 'For mange forsøg. Prøv igen om lidt.' };
  }

  const league = await findApprovedLeagueByCode(code);
  if (!league) {
    // Registrér mislykket forsøg (nulstil vindue hvis udløbet).
    const base = rl.reset ? { count: 0, windowStart: now } : (attempt || { count: 0, windowStart: now });
    await saveAttempt(uid, { count: (base.count || 0) + 1, windowStart: base.windowStart || now });
    return { ok: false, error: 'not-found', message: 'Ugyldig invitationskode — tjek den og prøv igen.' };
  }

  // Gyldig kode → godkend brugeren og tilmeld ligaen (idempotent).
  await approveUserAndJoin({ uid, leagueId: league.id });
  // Nulstil forsøgstælleren efter succes.
  await saveAttempt(uid, { count: 0, windowStart: now });

  return { ok: true, leagueId: league.id, leagueName: league.name };
}

module.exports = {
  MAX_ATTEMPTS, WINDOW_MS,
  normalizeInviteCode, checkRateLimit, redeemInviteCodeCore,
};

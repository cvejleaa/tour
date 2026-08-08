// ---------------------------------------------------------------------------
// scripts/seed-payload.mjs — HVAD SEEDET MÅ SKRIVE PÅ ET SPIL.
//
// Skilt ud af seed-games.mjs, fordi den fil initialiserer firebase-admin på
// øverste niveau og derfor ikke kan importeres fra en test. ADMIN_OWNED stod
// altså uden dækning: hele frontend-suiten forblev grøn, når 'joinable' blev
// fjernet fra listen — og konsekvensen er tavs og dyr. Se testen.
// ---------------------------------------------------------------------------

// Felter, admin styrer fra Spil-tidsplan-fanen. På et spil, der allerede
// findes, er virkeligheden i Firestore mere rigtig end listen i games.mjs:
// seedet skriver med merge, så uden denne liste ville hver kørsel stille rulle
// admins valg tilbage — uden fejl og uden spor.
//
//   status    En "Afsluttet"-markering ville blive sat tilbage til "I gang".
//   joinable  Et spil, admin har afsløret, ville blive skjult igen — og et
//             spil, admin har skjult for at gennemgå det, ville blive
//             afsløret. Begge veje er tavse.
export const ADMIN_OWNED = ['status', 'joinable'];

/**
 * Byg det, seedet skriver på ét spil.
 * @param {object} data    – spillets felter fra GAMES (uden id)
 * @param {{exists: boolean, now: unknown}} ctx – findes dokumentet? + tidsstempel
 * @returns {object} payload til set(..., { merge: true })
 */
export function seedPayload(data, { exists, now }) {
  const payload = { ...data, updatedAt: now };
  if (exists) {
    for (const f of ADMIN_OWNED) delete payload[f];
  } else {
    payload.createdAt = now;
  }
  return payload;
}

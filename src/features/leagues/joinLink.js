// ---------------------------------------------------------------------------
// Invitationslink til en liga: /tilmeld?kode=ABC123
//
// Linket virker for ALLE modtagere, uanset hvor de er i livscyklussen:
//   - Ny bruger:        koden gemmes lokalt → opret bruger → afventer-siden
//                       indløser den automatisk (godkender + tilmelder).
//   - Afventende bruger: koden indløses automatisk på afventer-siden.
//   - Godkendt bruger:   /tilmeld tilmelder direkte til ligaen.
// Koden overlever login/oprettelses-redirects via localStorage.
// ---------------------------------------------------------------------------

const KEY = 'tour.pendingJoinCode';

// Koden gemmes med tidsstempel og udløber efter en uge — et halvglemt
// invitationsklik skal ikke tilmelde folk en liga måneder senere.
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/**
 * Appens kanoniske adresse. Links bygges ALTID på den — serverens
 * joinLink-validering (sendBroadcastEmail) kræver præcis dette præfiks, og
 * window.location.origin ville give ubrugelige links fra preview-/
 * *.web.app-domæner.
 */
export const CANONICAL_ORIGIN = 'https://tour.vejleaa.dk';

/** Den samlede platforms kanoniske adresse (tip.vejleaa.dk). */
export const PLATFORM_ORIGIN = 'https://tip.vejleaa.dk';

/** Byg det delbare invitationslink for en join-kode (Tour, top-niveau-ligaer). */
export function joinLinkFor(code, origin) {
  const base = origin || CANONICAL_ORIGIN;
  return `${base}/tilmeld?kode=${encodeURIComponent(String(code ?? '').trim().toUpperCase())}`;
}

/**
 * Byg invitationslinket for en SPIL-liga på platformen. Linket bærer både
 * spil-id og kode, så modtageren tilmeldes den rigtige liga i det rigtige spil.
 */
export function gameJoinLinkFor(gameId, code, origin) {
  const base = origin || PLATFORM_ORIGIN;
  const c = encodeURIComponent(String(code ?? '').trim().toUpperCase());
  const g = encodeURIComponent(String(gameId ?? '').trim());
  return `${base}/tilmeld?spil=${g}&kode=${c}`;
}

/** Gem en kode (og evt. spil-id) fra et åbnet invitationslink (overlever login/oprettelse). */
export function setPendingJoinCode(code, gameId) {
  try {
    const c = String(code ?? '').trim().toUpperCase();
    const g = String(gameId ?? '').trim();
    if (c) localStorage.setItem(KEY, JSON.stringify({ code: c, gameId: g || null, at: Date.now() }));
  } catch { /* privat browsing e.l. — linket virker stadig manuelt */ }
}

function readPending() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // Ældre format: koden gemt som ren streng (intet tidsstempel) → gyldig.
    if (!raw.startsWith('{')) return { code: raw, gameId: null, at: null };
    const obj = JSON.parse(raw);
    if (Number.isFinite(obj.at) && Date.now() - obj.at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return obj;
  } catch { return null; }
}

/** Hent en evt. gemt kode fra et tidligere åbnet invitationslink. */
export function getPendingJoinCode() {
  return readPending()?.code || '';
}

/** Hent et evt. gemt spil-id fra et tidligere åbnet spil-liga-invitationslink. */
export function getPendingJoinGameId() {
  return readPending()?.gameId || '';
}

/** Ryd koden (efter vellykket indløsning/tilmelding). */
export function clearPendingJoinCode() {
  try { localStorage.removeItem(KEY); } catch { /* ignorér */ }
}

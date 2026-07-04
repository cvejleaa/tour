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

/** Byg det delbare invitationslink for en join-kode. */
export function joinLinkFor(code, origin) {
  const base = origin || CANONICAL_ORIGIN;
  return `${base}/tilmeld?kode=${encodeURIComponent(String(code ?? '').trim().toUpperCase())}`;
}

/** Gem en kode fra et åbnet invitationslink (overlever login/oprettelse). */
export function setPendingJoinCode(code) {
  try {
    const c = String(code ?? '').trim().toUpperCase();
    if (c) localStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() }));
  } catch { /* privat browsing e.l. — linket virker stadig manuelt */ }
}

/** Hent en evt. gemt kode fra et tidligere åbnet invitationslink. */
export function getPendingJoinCode() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return '';
    // Ældre format: koden gemt som ren streng (intet tidsstempel) → gyldig.
    if (!raw.startsWith('{')) return raw;
    const { code, at } = JSON.parse(raw);
    if (Number.isFinite(at) && Date.now() - at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return '';
    }
    return code || '';
  } catch { return ''; }
}

/** Ryd koden (efter vellykket indløsning/tilmelding). */
export function clearPendingJoinCode() {
  try { localStorage.removeItem(KEY); } catch { /* ignorér */ }
}

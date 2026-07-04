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

/** Byg det delbare invitationslink for en join-kode. */
export function joinLinkFor(code, origin) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/tilmeld?kode=${encodeURIComponent(String(code ?? '').trim().toUpperCase())}`;
}

/** Gem en kode fra et åbnet invitationslink (overlever login/oprettelse). */
export function setPendingJoinCode(code) {
  try {
    const c = String(code ?? '').trim().toUpperCase();
    if (c) localStorage.setItem(KEY, c);
  } catch { /* privat browsing e.l. — linket virker stadig manuelt */ }
}

/** Hent en evt. gemt kode fra et tidligere åbnet invitationslink. */
export function getPendingJoinCode() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

/** Ryd koden (efter vellykket indløsning/tilmelding). */
export function clearPendingJoinCode() {
  try { localStorage.removeItem(KEY); } catch { /* ignorér */ }
}

// ---------------------------------------------------------------------------
// Besøgsstatistik (presence) — rene hjælpere.
//
// Klienten stempler et lille presence-dokument pr. bruger (presence/{uid}):
//   { uid, lastSeenAt, days: { 'YYYY-MM-DD': antalBesøg }, pages: { side: n } }
// Et "besøg" = aktivitet efter mindst 30 minutters pause (session-semantik).
// Ingen cookies, ingen tredjepart — kun egne, indloggede spillere, og kun
// admin (og spilleren selv) kan læse dokumentet (firestore.rules).
// ---------------------------------------------------------------------------
import { TIMEZONE } from '../../lib/constants';

/** Pause der skal til, før ny aktivitet tæller som et NYT besøg. */
export const VISIT_GAP_MS = 30 * 60 * 1000;

/**
 * Oversæt en rute til en stabil side-nøgle (Firestore-feltnavn, ingen '/').
 * Undersider samles på sektionen ('/etape/3' → 'etaper', '/hold/UEX' → 'hold').
 */
const SECTION_BY_SEGMENT = {
  '': 'forside',
  etaper: 'etaper',
  etape: 'etaper',
  tour: 'tour',
  hold: 'hold',
  hjaelp: 'hjaelp',
  'mine-tips': 'minetips',
  bonus: 'bonus',
  stilling: 'stilling',
  ligaer: 'ligaer',
  beskeder: 'beskeder',
  profil: 'profil',
  admin: 'admin',
};

export function pageKeyFromPath(pathname) {
  const dele = String(pathname ?? '/').split('/').filter(Boolean);
  const seg = dele[0] ?? '';
  // Platformens kerne bor under /spil — og segmentet manglede i tabellen, så
  // AL spil-trafik (oversigten + alle faner i alle spil) landede i 'andet',
  // og "Mest brugte sider" var informationstom for præcis den flade,
  // platformen består af (sweep-fund L1-2). Oversigten og selve spillet
  // skelnes; fanerne inde i spillet bor i query-parametre, som en side-nøgle
  // (Firestore-feltnavn) bevidst ikke bærer.
  if (seg === 'spil') return dele.length > 1 ? 'spil' : 'spiloversigt';
  return SECTION_BY_SEGMENT[seg] || 'andet';
}

/** Danske visningsnavne til side-nøglerne (admin-fanen). */
export const PAGE_LABELS = {
  forside: 'Forside',
  etaper: 'Etaper',
  tour: 'Tour-stilling',
  hold: 'Hold',
  hjaelp: 'Hjælp',
  minetips: 'Mine tips',
  bonus: 'Bonus',
  stilling: 'Stilling',
  ligaer: 'Ligaer',
  beskeder: 'Beskeder',
  profil: 'Profil',
  admin: 'Admin',
  spiloversigt: 'Spiloversigt',
  spil: 'Inde i spillet',
  andet: 'Andet',
};

/** Dagsnøgle i dansk tid, 'YYYY-MM-DD' (en-CA giver ISO-rækkefølgen). */
export function dayKeyCopenhagen(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** Tæller denne aktivitet som et NYT besøg (≥30 min siden sidste ping)? */
export function isNewVisit(lastPingMs, nowMs) {
  const last = Number(lastPingMs) || 0;
  return nowMs - last >= VISIT_GAP_MS;
}

/**
 * Flet presence-dokumenter med brugerlisten til admin-rækker.
 * @param {Array<{id:string, displayName?:string, status?:string}>} users
 * @param {Array<{uid:string, lastSeenAt?:object, days?:object, pages?:object}>} presence
 * @returns {Array} rækker sorteret: senest sete først; aldrig-sete til sidst.
 */
export function activityRows(users, presence) {
  const byUid = new Map((presence || []).map((p) => [p.uid, p]));
  const rows = (users || [])
    .filter((u) => u.status === 'approved')
    .map((u) => {
      const p = byUid.get(u.id) || null;
      const days = p?.days || {};
      const pages = p?.pages || {};
      const lastSeenMs = p?.lastSeenAt?.toMillis?.() ?? 0;
      return {
        uid: u.id,
        name: u.displayName || u.id,
        lastSeenAt: p?.lastSeenAt ?? null,
        lastSeenMs,
        visits: Object.values(days).reduce((a, n) => a + (Number(n) || 0), 0),
        activeDays: Object.keys(days).length,
        topPages: Object.entries(pages)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([key, n]) => ({ key, label: PAGE_LABELS[key] || key, count: Number(n) || 0 })),
      };
    });
  return rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);
}

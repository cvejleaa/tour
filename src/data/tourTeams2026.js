// Cykelhold ved Tour de France 2026 (navne som de står hos letour.fr, så tip og
// resultat matcher). Bruges som seed/fallback til hold-dropdowns indtil
// `teams`-kollektionen er udfyldt automatisk fra de første etaperesultater.
// Holdnavne + logoer/trøjer er udtrukket fra racecenter.letour.fr (2026-startfelt).
import TEAMS_2026 from './tourTeams2026.json';

/** De 23 officielle holdnavne (strenge) — bevarer dropdown- + match-kontrakten. */
export const TOUR_TEAMS = TEAMS_2026.map((t) => t.name);

/**
 * Hele holdlisten som metadata-poster (rækkefølge som hos letour). Bruges af
 * holdsiderne. Hver post: { code, name, nameShort, nationality, jersey, logo,
 * color, riders? } — `riders` tilføjes senere når startlisten er offentliggjort.
 */
export const TEAMS = TEAMS_2026;

/** Normaliser et holdnavn til en opslagsnøgle (små bogstaver, trimmet). */
function normKey(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Holdmetadata slået op på BÅDE kode (fx "UEX") og normaliseret navn.
 * Hver post: { code, name, nameShort, nationality, jersey, logo, color }.
 */
export const TEAM_META = (() => {
  const map = {};
  for (const t of TEAMS_2026) {
    const entry = {
      code: t.code,
      name: t.name,
      nameShort: t.nameShort,
      nationality: t.nationality,
      jersey: t.jersey,
      logo: t.logo,
      color: t.color,
    };
    if (t.code) map[t.code] = entry;
    map[normKey(t.name)] = entry;
  }
  return map;
})();

/**
 * Slå holdmetadata op via kode eller navn. Returnerer posten eller null.
 * @param {string} nameOrCode
 */
export function teamMeta(nameOrCode) {
  if (!nameOrCode) return null;
  const raw = String(nameOrCode).trim();
  return TEAM_META[raw] || TEAM_META[normKey(raw)] || null;
}

/**
 * Pænere visning af et holdnavn. SIKKER for allerede blandet-kasse navne:
 * indeholder input små bogstaver, returneres det uændret (så "Team Visma |
 * Lease a Bike" ikke mangles). Ellers title-cases ALL-CAPS letour-navne, mens
 * kendte forkortelser bevares i versaler.
 */
const KEEP_UPPER = new Set(['UAE', 'EF', 'AG2R', 'FDJ', 'XDS', 'B&B', 'XRG', 'NSN', 'CGM', 'CMA', 'RGA', 'NL']);
export function prettyTeam(name) {
  if (!name) return '';
  const str = String(name);
  // Allerede blandet kasse (har små bogstaver) → lad være med at mangle.
  if (/[a-z]/.test(str)) return str;
  return str
    .split(' ')
    .map((w) => {
      const bare = w.replace(/[^A-Za-z&]/g, '');
      if (KEEP_UPPER.has(bare.toUpperCase()) && bare === bare.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

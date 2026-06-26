// Cykelhold ved Tour de France (navne som de står hos letour.fr, så tip og
// resultat matcher). Bruges som seed/fallback til hold-dropdowns indtil
// `teams`-kollektionen er udfyldt automatisk fra de første etaperesultater.
// Udtrukket fra letour holdkonkurrence (2025-startfelt) — rettes automatisk
// når 2026-resultaterne kommer ind.
export const TOUR_TEAMS = [
  'ALPECIN-DECEUNINCK',
  'ARKEA-B&B HOTELS',
  'BAHRAIN VICTORIOUS',
  'COFIDIS',
  'DECATHLON AG2R LA MONDIALE TEAM',
  'EF EDUCATION - EASYPOST',
  'GROUPAMA-FDJ',
  'INEOS GRENADIERS',
  'INTERMARCHÉ - WANTY',
  'ISRAEL - PREMIER TECH',
  'LIDL-TREK',
  'LOTTO',
  'MOVISTAR TEAM',
  'RED BULL - BORA - HANSGROHE',
  'SOUDAL QUICK-STEP',
  'TEAM JAYCO ALULA',
  'TEAM PICNIC POSTNL',
  'TEAM VISMA | LEASE A BIKE',
  'TOTALENERGIES',
  'TUDOR PRO CYCLING TEAM',
  'UAE TEAM EMIRATES XRG',
  'UNO-X MOBILITY',
  'XDS ASTANA TEAM',
];

/** Pænere visning af et all-caps holdnavn (bevarer kendte forkortelser). */
const KEEP_UPPER = new Set(['UAE', 'EF', 'AG2R', 'FDJ', 'XDS', 'B&B', 'XRG']);
export function prettyTeam(name) {
  if (!name) return '';
  return String(name)
    .split(' ')
    .map((w) => {
      const bare = w.replace(/[^A-Za-z&]/g, '');
      if (KEEP_UPPER.has(bare.toUpperCase()) && bare === bare.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

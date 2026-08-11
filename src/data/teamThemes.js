/**
 * TEAM_THEMES — valgbare farvetemaer der efterligner cykelholdenes farver.
 *
 * Hvert tema:
 *   key       — slug brugt i `data-team`-attributten på <html>
 *   label     — holdets visningsnavn (matcher navnene i tourTeams2026.json)
 *   primary   — klubbens farve. RÅ, ikke justeret: den køres igennem
 *               `accentTema` (src/lib/accentTema.js), som udleder de fem
 *               CSS-variabler for det basistema, brugeren står i.
 *   secondary — komplementær farve (hex)
 *
 * `onPrimary` STOD HER FØR — en håndsat '#fff' eller '#111' pr. hold. Det felt
 * er væk, fordi det var et skøn: visma fik '#111' og alligevel hvid tekst i
 * topbjælken (1,28:1), fordi det aktive nav-link hardkodede sin egen farve, og
 * ingen test målte de to mod hinanden. Blækket regnes nu ud af fladen, hver
 * gang, af `bedsteBlaek`.
 *
 * Temaerne lægger sig oven på BÅDE lyst og mørkt basistema; de recolorerer kun
 * accenten (knapper, aktiv-nav, links, fremhævninger) — ikke baggrund/tekst.
 */
export const TEAM_THEMES = [
  { key: 'alpecin',   label: 'Alpecin-Premier Tech',            primary: '#C8102E', secondary: '#111111' },
  { key: 'bahrain',   label: 'Bahrain Victorious',              primary: '#E30613', secondary: '#C8A55B' },
  { key: 'cajarural', label: 'Caja Rural-Seguros RGA',          primary: '#009639', secondary: '#FFFFFF' },
  { key: 'cofidis',   label: 'Cofidis',                         primary: '#E2001A', secondary: '#E2001A' },
  { key: 'decathlon', label: 'Decathlon CMA CGM Team',          primary: '#0082C3', secondary: '#111111' },
  { key: 'ef',        label: 'EF Education - Easypost',         primary: '#FF0098', secondary: '#1A2A5E' },
  { key: 'groupama',  label: 'Groupama-FDJ United',             primary: '#003DA5', secondary: '#E2001A' },
  { key: 'jayco',     label: 'Team Jayco AlUla',                primary: '#00B0B9', secondary: '#1A2A5E' },
  { key: 'lotto',     label: 'Lotto Intermarché',               primary: '#E30613', secondary: '#111111' },
  { key: 'lidltrek',  label: 'Lidl-Trek',                       primary: '#0050AA', secondary: '#E60012' },
  { key: 'movistar',  label: 'Movistar Team',                   primary: '#0033A0', secondary: '#00A19A' },
  { key: 'netcompany',label: 'Netcompany Ineos',                primary: '#DA291C', secondary: '#111111' },
  { key: 'nsn',       label: 'NSN Cycling Team',                primary: '#2B3A67', secondary: '#8C9BB5' },
  { key: 'pinarello', label: 'Pinarello-Q.36.5 Pro Cycling Team', primary: '#00B7C4', secondary: '#111111' },
  { key: 'redbull',   label: 'Red Bull - BORA - hansgrohe',     primary: '#122E5C', secondary: '#D8232A' },
  { key: 'soudal',    label: 'Soudal Quick-Step',               primary: '#0E1A7B', secondary: '#00A0DF' },
  { key: 'total',     label: 'TotalEnergies',                   primary: '#ED1C24', secondary: '#002F87' },
  { key: 'picnic',    label: 'Team Picnic PostNL',              primary: '#E2001A', secondary: '#FF6200' },
  { key: 'tudor',     label: 'Tudor Pro Cycling Team',          primary: '#1A1A1A', secondary: '#C8102E' },
  { key: 'visma',     label: 'Team Visma | Lease a Bike',       primary: '#FFE500', secondary: '#111111' },
  { key: 'uae',       label: 'UAE Team Emirates XRG',           primary: '#E4002B', secondary: '#111111' },
  { key: 'unox',      label: 'Uno-X Mobility',                  primary: '#ED1C45', secondary: '#9FB9D6' },
  { key: 'astana',    label: 'XDS Astana Team',                 primary: '#009DDC', secondary: '#FFD200' },
];

/** Slå et tema op på dets key. Returnerer posten eller null. */
export function teamThemeByKey(key) {
  if (!key) return null;
  return TEAM_THEMES.find((t) => t.key === key) ?? null;
}

/**
 * Slå tema-key op via et holdnavn (matcher `label`, case-insensitivt/trimmet).
 * Bruges til at koble profilens favoriteTeam (navne fra TOUR_TEAMS) til et tema.
 * @param {string} name
 * @returns {string|null} tema-key eller null hvis intet match.
 */
export function teamThemeKeyForName(name) {
  if (!name) return null;
  const norm = String(name).trim().toLowerCase();
  const hit = TEAM_THEMES.find((t) => t.label.trim().toLowerCase() === norm);
  return hit ? hit.key : null;
}

export default TEAM_THEMES;

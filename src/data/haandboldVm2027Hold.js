// ---------------------------------------------------------------------------
// Håndbold-VM 2027 (herrer) — de 32 hold.
//
// `name`    det danske navn. Det er NØGLEN i spillet: kampene seedes med det
//           (scripts/haandbold-vm2027-program.json), og Elo, odds og
//           holdsider slår op på det — samme form som superligaTeams2026.js.
// `short`   kortkoden på kampkortet. IHF's/IOC's landekode, som også står på
//           TV-grafikken og på Wikipedia.
// `hbKode`  koden i Wikipedias {{hb|…}}-skabelon — KILDENS nøgle, ikke
//           visningens. Den er i dag lig `short` for alle 32, men de to er
//           forskellige ting: ændres kortkoden på skærmen, må opslaget i
//           kilden ikke følge med (og omvendt).
// `aliaser` andre koder, kilden har brugt for samme hold (fx på en ældre side).
//           Tom for alle i dag; feltet findes, så en ny kode kan tilføjes uden
//           at ændre opslaget (`holdForKode`).
//
// MED VILJE UDELADT:
//   - `venue`: alle kampe spilles på neutral bane (kun Tyskland er hjemme), og
//     et hjemmestadion på kampkortet ville være forkert for 31 af 32
//     (FootballTip viser `venue`, når holdet har en).
//   - `elo`: startstyrkerne MÅLES i delopgave D4 og skrives ind dér. Indtil da
//     ville seedet give alle hold den neutrale rating uden et ord — D6 seeder
//     derfor ikke, før D4 har sat tallene (planen §12.2).
//   - farver: lægges ind i D6 (eller i admin); uden farve tegnes holdet gråt.
//
// Grupperne står i kampprogrammet, ikke her: et hold har ét navn hele
// turneringen, men skifter gruppe i hovedrunden.
// ---------------------------------------------------------------------------

export const HAANDBOLD_VM2027_HOLD = [
  { name: 'Tyskland',        short: 'GER', hbKode: 'GER', aliaser: [] },
  { name: 'Serbien',         short: 'SRB', hbKode: 'SRB', aliaser: [] },
  { name: 'Tunesien',        short: 'TUN', hbKode: 'TUN', aliaser: [] },
  { name: 'Uruguay',         short: 'URU', hbKode: 'URU', aliaser: [] },
  { name: 'Egypten',         short: 'EGY', hbKode: 'EGY', aliaser: [] },
  { name: 'Italien',         short: 'ITA', hbKode: 'ITA', aliaser: [] },
  { name: 'Kap Verde',       short: 'CPV', hbKode: 'CPV', aliaser: [] },
  { name: 'Saudi-Arabien',   short: 'KSA', hbKode: 'KSA', aliaser: [] },
  { name: 'Kroatien',        short: 'CRO', hbKode: 'CRO', aliaser: [] },
  { name: 'Spanien',         short: 'ESP', hbKode: 'ESP', aliaser: [] },
  { name: 'Chile',           short: 'CHI', hbKode: 'CHI', aliaser: [] },
  { name: 'Tyrkiet',         short: 'TUR', hbKode: 'TUR', aliaser: [] },
  { name: 'Argentina',       short: 'ARG', hbKode: 'ARG', aliaser: [] },
  { name: 'Frankrig',        short: 'FRA', hbKode: 'FRA', aliaser: [] },
  { name: 'Brasilien',       short: 'BRA', hbKode: 'BRA', aliaser: [] },
  { name: 'Kuwait',          short: 'KUW', hbKode: 'KUW', aliaser: [] },
  { name: 'Sverige',         short: 'SWE', hbKode: 'SWE', aliaser: [] },
  { name: 'Norge',           short: 'NOR', hbKode: 'NOR', aliaser: [] },
  { name: 'Grækenland',      short: 'GRE', hbKode: 'GRE', aliaser: [] },
  { name: 'Qatar',           short: 'QAT', hbKode: 'QAT', aliaser: [] },
  { name: 'Portugal',        short: 'POR', hbKode: 'POR', aliaser: [] },
  { name: 'Færøerne',        short: 'FRO', hbKode: 'FRO', aliaser: [] },
  { name: 'Polen',           short: 'POL', hbKode: 'POL', aliaser: [] },
  { name: 'Algeriet',        short: 'ALG', hbKode: 'ALG', aliaser: [] },
  { name: 'Danmark',         short: 'DEN', hbKode: 'DEN', aliaser: [] },
  { name: 'Slovenien',       short: 'SLO', hbKode: 'SLO', aliaser: [] },
  { name: 'USA',             short: 'USA', hbKode: 'USA', aliaser: [] },
  { name: 'Angola',          short: 'ANG', hbKode: 'ANG', aliaser: [] },
  { name: 'Island',          short: 'ISL', hbKode: 'ISL', aliaser: [] },
  { name: 'Nordmakedonien',  short: 'MKD', hbKode: 'MKD', aliaser: [] },
  { name: 'Bahrain',         short: 'BHR', hbKode: 'BHR', aliaser: [] },
  { name: 'Japan',           short: 'JPN', hbKode: 'JPN', aliaser: [] },
];

/**
 * Kildens kode → holdet. Slår op på `hbKode` OG `aliaser`. Ukendt → null —
 * aldrig et gæt; kalderen afviser (programmet kaster).
 */
export function holdForKode(kode, hold = HAANDBOLD_VM2027_HOLD) {
  if (typeof kode !== 'string' || !kode) return null;
  return hold.find((t) => t.hbKode === kode || (t.aliaser || []).includes(kode)) || null;
}

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
// `ihfNavn` holdets navn, som IHF skriver det på sine dag- og kampsider
//           («Germany», «United States of America»). Det er nøglen for
//           NØDVEJEN: IHF-parseren (functions-platform/ihfParse.js) læser
//           sider, ejeren gemmer i browseren (planen §13), og de har navne,
//           ikke koder. Opslaget er `holdForIhfNavn`, og et ukendt navn giver
//           null — aldrig et gæt. 25 af de 32 er set på IHF-sider i
//           functions-platform/testdata; de 7 andre (TUR, KUW, GRE, QAT, FRO,
//           POL, ANG) er IHF's sædvanlige stavning, men endnu ikke set på en
//           gemt side. Et forkert navn fejler HØJT (opslaget giver null), ikke
//           tavst. Testen holder regnskab med, hvilke der er set.
// `aliaser` andre koder, kilden har brugt for samme hold (fx på en ældre side).
//           Tom for alle i dag; feltet findes, så en ny kode kan tilføjes uden
//           at ændre opslaget (`holdForKode`).
//
// MED VILJE UDELADT:
//   - `venue`: alle kampe spilles på neutral bane (kun Tyskland er hjemme), og
//     et hjemmestadion på kampkortet ville være forkert for 31 af 32
//     (FootballTip viser `venue`, når holdet har en).
//   - `elo`: startstyrkerne MÅLES i delopgave D4 og skrives ind dér. Indtil da
//     viser seed-footballs tør-kørsel neutrale odds uden advarsel, og `--skriv`
//     vil efter al sandsynlighed fejle ved `gameRef.set`, fordi `eloCurrent`
//     får `undefined`-værdier (seed-football.mjs:288-289, :322 — udledt af
//     koden, ikke kørt). D6 seeder derfor ikke, før D4 har sat tallene
//     (planen §12.2). D4 skal VENDE fraværs-testen «INGEN elo» i
//     haandboldVm2027Hold.test.js.
//   - farver: lægges ind i D6 (eller i admin); uden farve tegnes holdet gråt.
//
// Grupperne står i kampprogrammet, ikke her: et hold har ét navn hele
// turneringen, men skifter gruppe i hovedrunden.
// ---------------------------------------------------------------------------

export const HAANDBOLD_VM2027_HOLD = [
  { name: 'Tyskland',        short: 'GER', hbKode: 'GER', ihfNavn: 'Germany',                   aliaser: [] },
  { name: 'Serbien',         short: 'SRB', hbKode: 'SRB', ihfNavn: 'Serbia',                    aliaser: [] },
  { name: 'Tunesien',        short: 'TUN', hbKode: 'TUN', ihfNavn: 'Tunisia',                   aliaser: [] },
  { name: 'Uruguay',         short: 'URU', hbKode: 'URU', ihfNavn: 'Uruguay',                   aliaser: [] },
  { name: 'Egypten',         short: 'EGY', hbKode: 'EGY', ihfNavn: 'Egypt',                     aliaser: [] },
  { name: 'Italien',         short: 'ITA', hbKode: 'ITA', ihfNavn: 'Italy',                     aliaser: [] },
  { name: 'Kap Verde',       short: 'CPV', hbKode: 'CPV', ihfNavn: 'Cape Verde',                aliaser: [] },
  { name: 'Saudi-Arabien',   short: 'KSA', hbKode: 'KSA', ihfNavn: 'Saudi Arabia',              aliaser: [] },
  { name: 'Kroatien',        short: 'CRO', hbKode: 'CRO', ihfNavn: 'Croatia',                   aliaser: [] },
  { name: 'Spanien',         short: 'ESP', hbKode: 'ESP', ihfNavn: 'Spain',                     aliaser: [] },
  { name: 'Chile',           short: 'CHI', hbKode: 'CHI', ihfNavn: 'Chile',                     aliaser: [] },
  { name: 'Tyrkiet',         short: 'TUR', hbKode: 'TUR', ihfNavn: 'Türkiye',                   aliaser: [] },
  { name: 'Argentina',       short: 'ARG', hbKode: 'ARG', ihfNavn: 'Argentina',                 aliaser: [] },
  { name: 'Frankrig',        short: 'FRA', hbKode: 'FRA', ihfNavn: 'France',                    aliaser: [] },
  { name: 'Brasilien',       short: 'BRA', hbKode: 'BRA', ihfNavn: 'Brazil',                    aliaser: [] },
  { name: 'Kuwait',          short: 'KUW', hbKode: 'KUW', ihfNavn: 'Kuwait',                    aliaser: [] },
  { name: 'Sverige',         short: 'SWE', hbKode: 'SWE', ihfNavn: 'Sweden',                    aliaser: [] },
  { name: 'Norge',           short: 'NOR', hbKode: 'NOR', ihfNavn: 'Norway',                    aliaser: [] },
  { name: 'Grækenland',      short: 'GRE', hbKode: 'GRE', ihfNavn: 'Greece',                    aliaser: [] },
  { name: 'Qatar',           short: 'QAT', hbKode: 'QAT', ihfNavn: 'Qatar',                     aliaser: [] },
  { name: 'Portugal',        short: 'POR', hbKode: 'POR', ihfNavn: 'Portugal',                  aliaser: [] },
  { name: 'Færøerne',        short: 'FRO', hbKode: 'FRO', ihfNavn: 'Faroe Islands',             aliaser: [] },
  { name: 'Polen',           short: 'POL', hbKode: 'POL', ihfNavn: 'Poland',                    aliaser: [] },
  { name: 'Algeriet',        short: 'ALG', hbKode: 'ALG', ihfNavn: 'Algeria',                   aliaser: [] },
  { name: 'Danmark',         short: 'DEN', hbKode: 'DEN', ihfNavn: 'Denmark',                   aliaser: [] },
  { name: 'Slovenien',       short: 'SLO', hbKode: 'SLO', ihfNavn: 'Slovenia',                  aliaser: [] },
  { name: 'USA',             short: 'USA', hbKode: 'USA', ihfNavn: 'United States of America',  aliaser: [] },
  { name: 'Angola',          short: 'ANG', hbKode: 'ANG', ihfNavn: 'Angola',                    aliaser: [] },
  { name: 'Island',          short: 'ISL', hbKode: 'ISL', ihfNavn: 'Iceland',                   aliaser: [] },
  { name: 'Nordmakedonien',  short: 'MKD', hbKode: 'MKD', ihfNavn: 'North Macedonia',           aliaser: [] },
  { name: 'Bahrain',         short: 'BHR', hbKode: 'BHR', ihfNavn: 'Bahrain',                   aliaser: [] },
  { name: 'Japan',           short: 'JPN', hbKode: 'JPN', ihfNavn: 'Japan',                     aliaser: [] },
];

/**
 * Kildens kode → holdet. Slår op på `hbKode` OG `aliaser`. Ukendt → null —
 * aldrig et gæt; kalderen afviser (programmet kaster).
 */
export function holdForKode(kode, hold = HAANDBOLD_VM2027_HOLD) {
  if (typeof kode !== 'string' || !kode) return null;
  return hold.find((t) => t.hbKode === kode || (t.aliaser || []).includes(kode)) || null;
}

/**
 * IHF's navn → holdet (nødvejen med gemte IHF-sider). Præcist match på
 * `ihfNavn`; ukendt → null, aldrig et gæt.
 */
export function holdForIhfNavn(navn, hold = HAANDBOLD_VM2027_HOLD) {
  if (typeof navn !== 'string' || !navn.trim()) return null;
  return hold.find((t) => t.ihfNavn === navn.trim()) || null;
}

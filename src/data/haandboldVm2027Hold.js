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
// `elo`     STARTSTYRKEN, MÅLT af scripts/maal-haandbold.mjs (afsnit 7): Elo
//           efter alle 677 kampe i scripts/haandbold-historik.json (VM 2019-
//           EM 2026, stillingen efter 60 min) med håndboldprofilens K og
//           metodens parametre (scripts/lib/haandboldMaaling.mjs, STARTMETODE).
//           Seedet prissætter de første kampe med den, og den levende Elo
//           (recomputeSeasonElo) starter fra den. Testen regner den efter —
//           et håndrettet tal her bliver rødt.
//           To undtagelser, begge dokumenteret og testet:
//             Tyskland: målt 1900 + værtsfordelen 25 = 1925. VM 2027 spilles
//               kun i Tyskland, og spillets HFA er 0 (neutral bane), så
//               værtsfordelen ligger i holdets start-Elo (planen B5). Målt
//               separat: bedste værdi 25-30 Elo-point, 95 %-interval 0-140 —
//               svagt bestemt, men data foretrækker den frem for 0.
//             Tyrkiet: ingen kampe i historikken (ikke med ved VM/EM 2019-
//               2026) → 1150, målingens bedste rating for et hold, der dukker
//               op første gang (STARTMETODE.nyStart). INGEN tavs fallback til
//               profilens START (1500, skalaens nulpunkt): testen kræver et
//               tal på hvert hold, og at præcis de hold uden historik — i dag
//               kun Tyrkiet — har nyStart.
//           Usikre, og det er accepteret (§11.8): ratingerne er recency-
//           tunge (K 120), og EM 2026-finalen (DEN-GER) mangler i historikken.
//
// MED VILJE UDELADT:
//   - `venue`: alle kampe spilles på neutral bane (kun Tyskland er hjemme), og
//     et hjemmestadion på kampkortet ville være forkert for 31 af 32
//     (FootballTip viser `venue`, når holdet har en).
//   - farver: lægges ind i D6 (eller i admin); uden farve tegnes holdet gråt.
//
// Grupperne står i kampprogrammet, ikke her: et hold har ét navn hele
// turneringen, men skifter gruppe i hovedrunden.
// ---------------------------------------------------------------------------

export const HAANDBOLD_VM2027_HOLD = [
  { name: 'Tyskland',        short: 'GER', hbKode: 'GER', ihfNavn: 'Germany',                   aliaser: [], elo: 1925 }, // 1900 + 25 værtsfordel
  { name: 'Serbien',         short: 'SRB', hbKode: 'SRB', ihfNavn: 'Serbia',                    aliaser: [], elo: 1358 },
  { name: 'Tunesien',        short: 'TUN', hbKode: 'TUN', ihfNavn: 'Tunisia',                   aliaser: [], elo: 1188 },
  { name: 'Uruguay',         short: 'URU', hbKode: 'URU', ihfNavn: 'Uruguay',                   aliaser: [], elo: 838 },
  { name: 'Egypten',         short: 'EGY', hbKode: 'EGY', ihfNavn: 'Egypt',                     aliaser: [], elo: 1681 },
  { name: 'Italien',         short: 'ITA', hbKode: 'ITA', ihfNavn: 'Italy',                     aliaser: [], elo: 1316 },
  { name: 'Kap Verde',       short: 'CPV', hbKode: 'CPV', ihfNavn: 'Cape Verde',                aliaser: [], elo: 1127 },
  { name: 'Saudi-Arabien',   short: 'KSA', hbKode: 'KSA', ihfNavn: 'Saudi Arabia',              aliaser: [], elo: 1178 },
  { name: 'Kroatien',        short: 'CRO', hbKode: 'CRO', ihfNavn: 'Croatia',                   aliaser: [], elo: 1849 },
  { name: 'Spanien',         short: 'ESP', hbKode: 'ESP', ihfNavn: 'Spain',                     aliaser: [], elo: 1560 },
  { name: 'Chile',           short: 'CHI', hbKode: 'CHI', ihfNavn: 'Chile',                     aliaser: [], elo: 1241 },
  { name: 'Tyrkiet',         short: 'TUR', hbKode: 'TUR', ihfNavn: 'Türkiye',                   aliaser: [], elo: 1150 }, // ingen historik → nyStart
  { name: 'Argentina',       short: 'ARG', hbKode: 'ARG', ihfNavn: 'Argentina',                 aliaser: [], elo: 1379 },
  { name: 'Frankrig',        short: 'FRA', hbKode: 'FRA', ihfNavn: 'France',                    aliaser: [], elo: 1749 },
  { name: 'Brasilien',       short: 'BRA', hbKode: 'BRA', ihfNavn: 'Brazil',                    aliaser: [], elo: 1635 },
  { name: 'Kuwait',          short: 'KUW', hbKode: 'KUW', ihfNavn: 'Kuwait',                    aliaser: [], elo: 1230 },
  { name: 'Sverige',         short: 'SWE', hbKode: 'SWE', ihfNavn: 'Sweden',                    aliaser: [], elo: 1631 },
  { name: 'Norge',           short: 'NOR', hbKode: 'NOR', ihfNavn: 'Norway',                    aliaser: [], elo: 1637 },
  { name: 'Grækenland',      short: 'GRE', hbKode: 'GRE', ihfNavn: 'Greece',                    aliaser: [], elo: 1089 },
  { name: 'Qatar',           short: 'QAT', hbKode: 'QAT', ihfNavn: 'Qatar',                     aliaser: [], elo: 1214 },
  { name: 'Portugal',        short: 'POR', hbKode: 'POR', ihfNavn: 'Portugal',                  aliaser: [], elo: 1773 },
  { name: 'Færøerne',        short: 'FRO', hbKode: 'FRO', ihfNavn: 'Faroe Islands',             aliaser: [], elo: 1264 },
  { name: 'Polen',           short: 'POL', hbKode: 'POL', ihfNavn: 'Poland',                    aliaser: [], elo: 1238 },
  { name: 'Algeriet',        short: 'ALG', hbKode: 'ALG', ihfNavn: 'Algeria',                   aliaser: [], elo: 930 },
  { name: 'Danmark',         short: 'DEN', hbKode: 'DEN', ihfNavn: 'Denmark',                   aliaser: [], elo: 2055 },
  { name: 'Slovenien',       short: 'SLO', hbKode: 'SLO', ihfNavn: 'Slovenia',                  aliaser: [], elo: 1559 },
  { name: 'USA',             short: 'USA', hbKode: 'USA', ihfNavn: 'United States of America',  aliaser: [], elo: 1300 },
  { name: 'Angola',          short: 'ANG', hbKode: 'ANG', ihfNavn: 'Angola',                    aliaser: [], elo: 1071 },
  { name: 'Island',          short: 'ISL', hbKode: 'ISL', ihfNavn: 'Iceland',                   aliaser: [], elo: 1695 },
  { name: 'Nordmakedonien',  short: 'MKD', hbKode: 'MKD', ihfNavn: 'North Macedonia',           aliaser: [], elo: 1444 },
  { name: 'Bahrain',         short: 'BHR', hbKode: 'BHR', ihfNavn: 'Bahrain',                   aliaser: [], elo: 1152 },
  { name: 'Japan',           short: 'JPN', hbKode: 'JPN', ihfNavn: 'Japan',                     aliaser: [], elo: 1157 },
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

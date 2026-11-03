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
//           efter alle 678 kampe i scripts/haandbold-historik.json (VM 2019-
//           EM 2026 inkl. finalen, stillingen efter 60 min) med håndboldprofilens K og
//           metodens parametre (scripts/lib/haandboldMaaling.mjs, STARTMETODE).
//           Seedet prissætter de første kampe med den, og den levende Elo
//           (recomputeSeasonElo) starter fra den. Testen regner den efter —
//           et håndrettet tal her bliver rødt.
//           To undtagelser, begge dokumenteret og testet:
//             Tyskland: målt 1869 + værtsfordelen 25 = 1894. VM 2027 spilles
//               kun i Tyskland, og spillets HFA er 0 (neutral bane), så
//               værtsfordelen ligger i holdets start-Elo (planen B5). +25 er
//               et VALG, ikke en måling: punktestimatet er 25-35 Elo-point,
//               men 95 %-intervallet er 0-140, og 0 koster kun ΔNLL 0,25
//               (grænsen er 1,92). Ejeren beslutter (VAERT_2027 i
//               scripts/lib/haandboldMaaling.mjs; priserne med og uden står i
//               scripts/maal-haandbold.mjs afsnit 8b).
//             Tyrkiet: ingen kampe i historikken (ikke med ved VM/EM 2019-
//               2026) → 1150, målingens bedste rating for et hold, der dukker
//               op første gang (STARTMETODE.nyStart; 95 %-interval 1050-1275,
//               afsnit 7a, så ±ca. 120). INGEN tavs fallback til
//               profilens START (1500, skalaens nulpunkt): testen kræver et
//               tal på hvert hold, og at præcis de hold uden historik — i dag
//               kun Tyrkiet — har nyStart.
//           Usikre, og det er accepteret (§11.8): ratingerne er recency-
//           tunge (K 120). EM 2026-finalen (DEN–GER 34–27, transkluderet fra
//           sin egen side) ER med: uden den stod Danmark 2055 og Tyskland
//           1925; finalen alene flyttede hver af dem 31 point.
// `iso2`    landets kode i ISO 3166-1 alpha-2 med SMÅ bogstaver ('dk') —
//           VISNINGENS nøgle: den vælger landeflaget (filnavnet i flag-icons,
//           src/features/games/football/landeflag.js). Den er IKKE en
//           kildenøgle og må aldrig blive det: Highlightlys hold bærer ingen
//           landekode ({id, name, logo}; `{"code":"DK"}` er svaret fra
//           /countries, og `match.country` er turneringens land), så der kan
//           ikke matches hold på den. Afledes heller ikke af `hbKode` — det
//           ville være at gate visningen på kildens nøgle (en proxy).
//           Flaget vises kun, når ALLE spillets hold har ét (harLandeflag),
//           så en kolonne aldrig blander flag og trøjer.
// `color`, `awayColor`
//           LANDEFARVERNE — samme form som klubbernes (superligaTeams2026.js),
//           men de tegner ikke en trøje, når spillet har flag: de giver RINGEN
//           om spillerens avatar og spillets TEMA (badges.js klubFarverAf /
//           klubAccentAf). Uden dem fik alle 32 en grå ring (QC på flagplanen).
//           `color` er ringens og temaets farve; `awayColor` er ringens
//           SEKUNDÆRFARVE, så Danmark (rød/hvid) og Norge (rød/blå) kan
//           skelnes i stillingen (badges.js `sekundaerAf`).
//           Begge er farver FRA HOLDETS EGET FLAG, læst i flag-icons' svg —
//           testen kræver, at de står i filen, så en farve skrevet fra
//           hukommelsen er rød. Det er landets farve, ikke landsholdstrøjen:
//           Italien er derfor grøn (flaget), ikke azzurro (trøjen). `color`
//           har kulør nok til at tone en hel side (KULOER_GULV), så ring og
//           tema er den SAMME farve for alle 32 — også det står i testen.
//
// MED VILJE UDELADT:
//   - `venue`: alle kampe spilles på neutral bane (kun Tyskland er hjemme), og
//     et hjemmestadion på kampkortet ville være forkert for 31 af 32
//     (FootballTip viser `venue`, når holdet har en).
//   - `thirdColor` og `troejer`: de findes kun for at vælge mellem trøjer på
//     kampkortet, og et flag-spil tegner ingen trøjer.
//
// I PRODUKTION kommer `iso2` og farverne ad «Ret holdlisten» (seedTeams med
// --teams-only, docs/drift.md) — tør-kørslen viser «landeflag: 32 af 32».
//
// Grupperne står i kampprogrammet, ikke her: et hold har ét navn hele
// turneringen, men skifter gruppe i hovedrunden.
// ---------------------------------------------------------------------------

export const HAANDBOLD_VM2027_HOLD = [
  { name: 'Tyskland',        short: 'GER', hbKode: 'GER', ihfNavn: 'Germany',                   aliaser: [], elo: 1894, iso2: 'de', color: '#FF0000', awayColor: '#FFCC00' }, // 1869 + 25 værtsfordel
  { name: 'Serbien',         short: 'SRB', hbKode: 'SRB', ihfNavn: 'Serbia',                    aliaser: [], elo: 1358, iso2: 'rs', color: '#C6363C', awayColor: '#0C4076' },
  { name: 'Tunesien',        short: 'TUN', hbKode: 'TUN', ihfNavn: 'Tunisia',                   aliaser: [], elo: 1188, iso2: 'tn', color: '#E70013', awayColor: '#FFFFFF' },
  { name: 'Uruguay',         short: 'URU', hbKode: 'URU', ihfNavn: 'Uruguay',                   aliaser: [], elo: 838, iso2: 'uy', color: '#0038A8', awayColor: '#FFFFFF' },
  { name: 'Egypten',         short: 'EGY', hbKode: 'EGY', ihfNavn: 'Egypt',                     aliaser: [], elo: 1681, iso2: 'eg', color: '#CE1126', awayColor: '#FFFFFF' },
  { name: 'Italien',         short: 'ITA', hbKode: 'ITA', ihfNavn: 'Italy',                     aliaser: [], elo: 1316, iso2: 'it', color: '#009246', awayColor: '#CE2B37' },
  { name: 'Kap Verde',       short: 'CPV', hbKode: 'CPV', ihfNavn: 'Cape Verde',                aliaser: [], elo: 1127, iso2: 'cv', color: '#081873', awayColor: '#DE3929' },
  { name: 'Saudi-Arabien',   short: 'KSA', hbKode: 'KSA', ihfNavn: 'Saudi Arabia',              aliaser: [], elo: 1178, iso2: 'sa', color: '#165D31', awayColor: '#FFFFFF' },
  { name: 'Kroatien',        short: 'CRO', hbKode: 'CRO', ihfNavn: 'Croatia',                   aliaser: [], elo: 1849, iso2: 'hr', color: '#FF0000', awayColor: '#171796' },
  { name: 'Spanien',         short: 'ESP', hbKode: 'ESP', ihfNavn: 'Spain',                     aliaser: [], elo: 1560, iso2: 'es', color: '#AA151B', awayColor: '#F1BF00' },
  { name: 'Chile',           short: 'CHI', hbKode: 'CHI', ihfNavn: 'Chile',                     aliaser: [], elo: 1241, iso2: 'cl', color: '#D52B1E', awayColor: '#0039A6' },
  { name: 'Tyrkiet',         short: 'TUR', hbKode: 'TUR', ihfNavn: 'Türkiye',                   aliaser: [], elo: 1150, iso2: 'tr', color: '#E30A17', awayColor: '#FFFFFF' }, // ingen historik → nyStart
  { name: 'Argentina',       short: 'ARG', hbKode: 'ARG', ihfNavn: 'Argentina',                 aliaser: [], elo: 1379, iso2: 'ar', color: '#74ACDF', awayColor: '#FFFFFF' },
  { name: 'Frankrig',        short: 'FRA', hbKode: 'FRA', ihfNavn: 'France',                    aliaser: [], elo: 1749, iso2: 'fr', color: '#000091', awayColor: '#E1000F' },
  { name: 'Brasilien',       short: 'BRA', hbKode: 'BRA', ihfNavn: 'Brazil',                    aliaser: [], elo: 1635, iso2: 'br', color: '#F8E509', awayColor: '#229E45' },
  { name: 'Kuwait',          short: 'KUW', hbKode: 'KUW', ihfNavn: 'Kuwait',                    aliaser: [], elo: 1230, iso2: 'kw', color: '#00D941', awayColor: '#F31830' },
  { name: 'Sverige',         short: 'SWE', hbKode: 'SWE', ihfNavn: 'Sweden',                    aliaser: [], elo: 1631, iso2: 'se', color: '#FECB00', awayColor: '#005293' },
  { name: 'Norge',           short: 'NOR', hbKode: 'NOR', ihfNavn: 'Norway',                    aliaser: [], elo: 1637, iso2: 'no', color: '#ED2939', awayColor: '#002664' },
  { name: 'Grækenland',      short: 'GRE', hbKode: 'GRE', ihfNavn: 'Greece',                    aliaser: [], elo: 1089, iso2: 'gr', color: '#0D5EAF', awayColor: '#FFFFFF' },
  { name: 'Qatar',           short: 'QAT', hbKode: 'QAT', ihfNavn: 'Qatar',                     aliaser: [], elo: 1214, iso2: 'qa', color: '#8D1B3D', awayColor: '#FFFFFF' },
  { name: 'Portugal',        short: 'POR', hbKode: 'POR', ihfNavn: 'Portugal',                  aliaser: [], elo: 1773, iso2: 'pt', color: '#FF0000', awayColor: '#006600' },
  { name: 'Færøerne',        short: 'FRO', hbKode: 'FRO', ihfNavn: 'Faroe Islands',             aliaser: [], elo: 1264, iso2: 'fo', color: '#D72828', awayColor: '#003897' },
  { name: 'Polen',           short: 'POL', hbKode: 'POL', ihfNavn: 'Poland',                    aliaser: [], elo: 1238, iso2: 'pl', color: '#DC143C', awayColor: '#FFFFFF' },
  { name: 'Algeriet',        short: 'ALG', hbKode: 'ALG', ihfNavn: 'Algeria',                   aliaser: [], elo: 930, iso2: 'dz', color: '#006233', awayColor: '#D21034' },
  { name: 'Danmark',         short: 'DEN', hbKode: 'DEN', ihfNavn: 'Denmark',                   aliaser: [], elo: 2086, iso2: 'dk', color: '#C8102E', awayColor: '#FFFFFF' },
  { name: 'Slovenien',       short: 'SLO', hbKode: 'SLO', ihfNavn: 'Slovenia',                  aliaser: [], elo: 1559, iso2: 'si', color: '#0000BF', awayColor: '#D50000' },
  { name: 'USA',             short: 'USA', hbKode: 'USA', ihfNavn: 'United States of America',  aliaser: [], elo: 1300, iso2: 'us', color: '#192F5D', awayColor: '#BD3D44' },
  { name: 'Angola',          short: 'ANG', hbKode: 'ANG', ihfNavn: 'Angola',                    aliaser: [], elo: 1071, iso2: 'ao', color: '#FF0000', awayColor: '#FFEC00' },
  { name: 'Island',          short: 'ISL', hbKode: 'ISL', ihfNavn: 'Iceland',                   aliaser: [], elo: 1695, iso2: 'is', color: '#003897', awayColor: '#D72828' },
  { name: 'Nordmakedonien',  short: 'MKD', hbKode: 'MKD', ihfNavn: 'North Macedonia',           aliaser: [], elo: 1444, iso2: 'mk', color: '#D20000', awayColor: '#FFE600' },
  { name: 'Bahrain',         short: 'BHR', hbKode: 'BHR', ihfNavn: 'Bahrain',                   aliaser: [], elo: 1152, iso2: 'bh', color: '#CE1126', awayColor: '#FFFFFF' },
  { name: 'Japan',           short: 'JPN', hbKode: 'JPN', ihfNavn: 'Japan',                     aliaser: [], elo: 1157, iso2: 'jp', color: '#BC002D', awayColor: '#FFFFFF' },
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

// ---------------------------------------------------------------------------
// EN KLUBFARVE IND, ET LÆSBART ACCENT-TEMA UD.
//
// Temaerne blev før holdt i hånden: 23 rækker `[data-team='…']` i theme.css,
// som var en kopi af `teamThemes.js` uden en eneste test til at holde de to
// filer i takt. Den eneste kontrol, der fandtes, lå i `TeamThemePicker.test.jsx`
// og krævede kontrast >= 3 mellem `primary` og `onPrimary` — altså mellem to
// tal, CSS'en slet ikke brugte.
//
// Hvad den kontrol ikke så, og hvad den her fil derfor gør noget ved:
//
//  · --c-pitch er langt overvejende BLÆK. 16 regler i theme.css skriver
//    `color: var(--c-pitch)` og seks en border-farve; kun tre bruger den som
//    fyldt flade. (Der stod 23 her, fordi jeg havde talt border-farverne med
//    som blæk — de har et andet krav.) Blækket står
//    på et kort (--c-surface), ikke på sidebaggrunden — og egen-rækken i
//    stillingen er endnu lysere. Måler man mod --c-bg, som jeg først gjorde,
//    lander en farve justeret til 4,5:1 på 3,75-3,84 dér, hvor den faktisk står.
//    Derfor måles der mod `haardeste`: den sværeste flade, farven tegnes på.
//
//  · --c-on-pitch var hardkodet pr. tema ('#fff' eller '#111' i øjemål). Med en
//    lys klubfarve gav det hvid på gul: Sønderjyske 1,53:1, Horsens 1,68,
//    Brøndby 1,86, Randers 1,91. Blækket regnes nu ud af fladen.
//
//  · --c-pitch-weak og --c-pitch-tint stod ALDRIG defineret nogen steder. Begge
//    blev brugt med fallbacken #eef7f1 — næsten hvid. Hvad der faktisk var i
//    stykker på den: ETIKETTEN i pointopdelingens total (--c-muted i mørkt tema,
//    2,25:1) og teksten i egne beskedbobler (--c-text i mørkt tema, 1,02:1).
//    Selve totalens tal var derimod læseligt (5,72:1) — jeg skrev først 1,40-
//    1,70:1 og tilskrev det tallet, men de tal hører til en anden situation:
//    en LYS KLUBFARVE som blæk på den næsten hvide fallback, altså noget, der
//    først ville være opstået MED den her ændring. De defineres her, sammen
//    med resten, og fallbacken er fjernet fra begge brugssteder.
//
// Hele udregningen er ren og ligger ét sted, så `scripts/accent-tema.mjs` kan
// køre den over alle hold i begge temaer og vise tallene.
// ---------------------------------------------------------------------------

// Endelsen SKAL med: `scripts/accent-tema.mjs` importerer den her fil direkte i
// node, hvor Vites udvidelsesløse opslag ikke findes.
import { kontrast, relativLuminans } from './contrastText.js';

/** De to blækfarver, en flade kan bære. Samme mørke som `textOn` returnerer. */
export const MOERKT_BLAEK = '#10151b';
export const LYST_BLAEK = '#ffffff';

/**
 * Fladerne i hvert basistema — hentet fra `:root` og `[data-theme='dark']`.
 *
 * `haardeste` er den SVÆRESTE flade, --c-pitch faktisk tegnes som tekst på.
 * I lyst tema er det --c-surface (#ffffff), i mørkt --c-surface-2 (#202a34),
 * som er den lyseste af de mørke flader (.rank-row--me og beskedbobler).
 * `kort` er --c-surface: den flade, --c-pitch-weak/-tint blandes ned i.
 */
export const SIDEFLADER = {
  lyst: {
    baggrund: '#f7f9fb', haardeste: '#ffffff', kort: '#ffffff',
    muted: '#6b7682', tekst: '#14181f',
  },
  moerkt: {
    baggrund: '#0e1419', haardeste: '#202a34', kort: '#161e26',
    muted: '#9aa7b2', tekst: '#eef3f7',
  },
};

/** Blæk skal kunne læses: WCAG AA for normal tekst. */
export const KRAV_BLAEK = 4.5;
/** En farvet flade skal kunne SES mod siden bagved: WCAG 1.4.11. */
export const KRAV_FLADE = 3;
/** Den dæmpede etiket oven på --c-pitch-weak. Den ligger på 4,4:1 på et blankt
 *  kort i forvejen, så 4,5 ville være et krav, selve kortet ikke opfylder. */
export const KRAV_ETIKET = 3;

/** Hvor lidt kulør en farve må have, før den ikke kan bruges som tema. */
export const KULOER_GULV = 0.1;

/** Variabelnavnene i CSS — ét sted, så tema og stylesheet ikke kan glide fra hinanden. */
export const TEMA_VARIABLE = {
  pitch: '--c-pitch',
  pitchDark: '--c-pitch-dark',
  onPitch: '--c-on-pitch',
  pitchWeak: '--c-pitch-weak',
  pitchTint: '--c-pitch-tint',
};

/* ── farverum ────────────────────────────────────────────────────────────── */

function toTal(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function tilHex(r, g, b) {
  const to = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** hex → [kulørtone 0-360, mætning 0-100, lyshed 0-100]. */
export function hexTilHsl(hex) {
  const t = toTal(hex);
  if (!t) return [0, 0, 0];
  const [r, g, b] = t.map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s * 100, l * 100];
}

/** [kulørtone, mætning, lyshed] → hex. */
export function hslTilHex(h, s, l) {
  const S = Math.min(100, Math.max(0, s)) / 100;
  const L = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = L - c / 2;
  const tabel = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  const [r, g, b] = tabel[Math.floor(hh) % 6];
  return tilHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Bland `pct` procent af `a` ned i `b` — samme regnestykke som CSS color-mix i srgb. */
export function bland(a, b, pct) {
  const x = toTal(a);
  const y = toTal(b);
  if (!x || !y) return b;
  const k = Math.min(100, Math.max(0, pct)) / 100;
  return tilHex(x[0] * k + y[0] * (1 - k), x[1] * k + y[1] * (1 - k), x[2] * k + y[2] * (1 - k));
}

/* ── selve udledningen ───────────────────────────────────────────────────── */

/**
 * Skub farvens lyshed ÉT PROCENTPOINT AD GANGEN i `retning`, indtil den har
 * `krav` mod `modflade`. Kulørtone og mætning står stille, så holdets farve
 * bliver ved med at være holdets farve — den bliver kun dyb nok eller lys nok.
 *
 * Der findes altid et svar, og kun i én retning: i lyst tema måles mod hvid, og
 * ingen farve kan blive lys NOK til at nå 4,5:1 mod hvid; i mørkt tema måles
 * mod #202a34, og ingen farve kan blive mørk nok (det ville kræve negativ
 * luminans). Derfor er `retning` givet af temaet, ikke af et skøn.
 */
export function juster(farve, modflade, krav, retning) {
  const [h, s, l] = hexTilHsl(farve);
  for (let trin = 0; trin <= 100; trin += 1) {
    const nyL = Math.min(100, Math.max(0, l + retning * trin));
    const kandidat = hslTilHex(h, s, nyL);
    if (kontrast(kandidat, modflade) >= krav) return kandidat;
    if (nyL === 0 || nyL === 100) break;
  }
  return retning < 0 ? '#000000' : '#ffffff';
}

/** Det af de to blæk, der står stærkest på fladen. Ikke et skøn — en måling. */
export function bedsteBlaek(flade) {
  return kontrast(flade, MOERKT_BLAEK) >= kontrast(flade, LYST_BLAEK) ? MOERKT_BLAEK : LYST_BLAEK;
}

/**
 * Hover-fladen (--c-pitch-dark). Skubbes VÆK fra blækket, aldrig imod: er
 * blækket hvidt, bliver fladen mørkere; er blækket mørkt, bliver den lysere.
 *
 * Navnet lyver derfor i mørkt tema — dér er "dark" den LYSERE af de to. Det er
 * med vilje: variablen er hover-flade og gradient-ende, og begge steder skal
 * den skille sig ud fra --c-pitch UDEN at æde blækket. At skubbe væk fra
 * blækket kan pr. konstruktion kun forbedre kontrasten.
 */
export function skygge(flade, blaek) {
  const [h, s, l] = hexTilHsl(flade);
  const nyL = blaek === LYST_BLAEK ? l * 0.7 : l + (100 - l) * 0.2;
  return hslTilHex(h, s, nyL);
}

/**
 * En svag tone af accenten som FLADE. Blandingsgraden er ikke valgt, den er
 * fundet: vi går ned fra 10 % og tager den kraftigste tone, som stadig lader
 * blækket ovenpå bestå. En fast procent ville virke for de dybe farver og
 * kvæle teksten under de lyse.
 */
export function svagFlade(accent, kort, bestaar) {
  for (const grad of [10, 8, 6, 5, 4, 3, 2]) {
    const kandidat = bland(accent, kort, grad);
    if (bestaar(kandidat)) return kandidat;
  }
  return kort;
}

/**
 * Klubfarve + basistema → de fem CSS-variabler.
 *
 * @param {string} klubfarve hex
 * @param {'lyst'|'moerkt'} mode
 */
export function accentTema(klubfarve, mode) {
  const flader = SIDEFLADER[mode];
  if (!flader) throw new Error(`Ukendt tema: ${mode}`);
  const opad = mode === 'moerkt';
  const pitch = juster(klubfarve, flader.haardeste, KRAV_BLAEK, opad ? 1 : -1);
  const onPitch = bedsteBlaek(pitch);
  const pitchDark = skygge(pitch, onPitch);
  const pitchWeak = svagFlade(pitch, flader.kort, (f) => (
    kontrast(pitch, f) >= KRAV_BLAEK && kontrast(flader.muted, f) >= KRAV_ETIKET
  ));
  const pitchTint = svagFlade(pitch, flader.kort, (f) => kontrast(flader.tekst, f) >= KRAV_BLAEK);
  return { pitch, pitchDark, onPitch, pitchWeak, pitchTint };
}

/**
 * Alle de krav, et tema skal bestå. Returnerer en liste af fund — tom = i orden.
 * Både testene og `scripts/accent-tema.mjs` kalder DEN HER, så et krav ikke kan
 * stå strengt i harnesset og løst i suiten.
 */
export function temaFund(tema, mode) {
  const f = SIDEFLADER[mode];
  const fund = [];
  const krav = (navn, maalt, mindst) => {
    if (maalt + 1e-9 < mindst) fund.push(`${navn}: ${maalt.toFixed(2)} < ${mindst}`);
  };
  krav('blæk på hårdeste flade', kontrast(tema.pitch, f.haardeste), KRAV_BLAEK);
  krav('flade mod sidebaggrund', kontrast(tema.pitch, f.baggrund), KRAV_FLADE);
  krav('on-pitch på pitch', kontrast(tema.onPitch, tema.pitch), KRAV_BLAEK);
  krav('on-pitch på pitch-dark', kontrast(tema.onPitch, tema.pitchDark), KRAV_BLAEK);
  krav('pitch-dark mod sidebaggrund', kontrast(tema.pitchDark, f.baggrund), KRAV_FLADE);
  krav('blæk på pitch-weak', kontrast(tema.pitch, tema.pitchWeak), KRAV_BLAEK);
  krav('etiket på pitch-weak', kontrast(f.muted, tema.pitchWeak), KRAV_ETIKET);
  krav('tekst på pitch-tint', kontrast(f.tekst, tema.pitchTint), KRAV_BLAEK);
  return fund;
}

/** Temaet som et style-objekt, React kan sætte direkte på en container. */
export function temaStil(tema) {
  const stil = {};
  for (const [felt, variabel] of Object.entries(TEMA_VARIABLE)) stil[variabel] = tema[felt];
  return stil;
}

/** Hjælper til harness og fejlsøgning: luminans afrundet. */
export const luminans = relativLuminans;

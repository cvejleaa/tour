// ---------------------------------------------------------------------------
// HVILKEN TRØJE ET HOLD TEGNES I — ét sted.
//
// `badgeFor` og `matchBadges` lå inde i `FootballTip.jsx`, og `badgeFor` var
// ikke eksporteret. Det er det eneste sted, hvor admin-overrides
// (`games/{id}.teamStyles`) slår igennem, så enhver anden flade, der ville vise
// et holds farve, måtte enten læse rådata — og dermed IGNORERE en farve, ejeren
// havde rettet i hånden — eller kopiere logikken. Begge dele er sket før:
// `teamInfo.js` beskriver selv problemet ("farve-overrides slår kun igennem på
// tip-fladen, fordi hver flade selv skulle huske at slå dem op").
//
// De bor derfor her, hvor både kampkortet, stillingen og ligaerne kan nå dem.
// ---------------------------------------------------------------------------

import { teamInfo } from './teamInfo';
import { colorsClash, colorDistance } from '../../../lib/contrastText';

/** Farven for et hold, vi intet ved om. Ikke sort: sort er en ægte trøjefarve. */
export const GREY = '#5b6b7a';

/**
 * Badge-info for et hold: klub-kortkode + farve + stadion.
 * variant 'home' | 'away' | 'third'. Admin-override (games/{id}.teamStyles)
 * vinder over standardfarven; hver variant falder pænt tilbage.
 */
export function badgeFor(teams, name, styles = {}, variant = 'home') {
  const info = teamInfo(teams, name);
  const ov = styles?.[name] || {};
  let override;
  let fallback;
  if (variant === 'away') {
    override = ov.awayColor;
    fallback = info?.awayColor || info?.color || GREY;
  } else if (variant === 'third') {
    override = ov.thirdColor;
    fallback = info?.thirdColor || info?.awayColor || info?.color || GREY;
  } else {
    override = ov.color;
    fallback = info?.color || GREY;
  }
  const code = info?.short
    || String(name || '').replace(/[^A-Za-zÆØÅæøå]/g, '').slice(0, 3).toUpperCase() || '?';
  // Trøjens FORM — sekundærfarve, mønster og ærme. Ligger som ét nested felt
  // på holdet, så de tre color-felter kunne blive stående uændrede. Mangler
  // det, tegnes trøjen ensfarvet — og det gør de fleste: kun fire af
  // Superligaens tolv og under halvdelen af Premier Leagues tyve har et
  // mønster, fordi en stribe skal fylde noget for at kunne ses ved 22 px.
  const nøgle = { home: 'hjemme', away: 'ude', third: 'tredje' }[variant];
  const form = info?.troejer?.[nøgle] || {};
  return {
    code,
    // Visningsnavnet — "Brighton" frem for "Brighton and Hove Albion".
    navn: info?.vis || name,
    color: override || fallback,
    venue: info?.venue ?? null,
    color2: form.sekundaer ?? null,
    moenster: form.moenster ?? null,
    aerme: form.aerme ?? null,
  };
}

/**
 * Farver til et kamp-kort: hjemmeholdet i hjemmefarve, udeholdet i udefarve —
 * men skift til udeholdets tertiærfarve hvis udefarven clasher med hjemmefarven.
 *
 * VÆLGER DEN FJERNESTE, ikke "den første der er god nok". Reglen var før
 * `if (!colorsClash(third, hjemme)) brug third` — altså: brug KUN tredjefarven,
 * hvis den slet ikke clasher. Clashede begge, faldt kortet tilbage på udefarven,
 * som man netop havde konstateret var for tæt på.
 *
 * Kommentaren her sagde allerede "brug kun tertiær hvis den faktisk er mindre
 * clash end udefarven". Koden gjorde noget andet, og forskellen var usynlig,
 * indtil Silkeborgs tredjefarve blev målt: den gik fra blå til lyserød, og så
 * stod FCK–Silkeborg og AGF–Silkeborg med TO ENS HVIDE badges, fordi
 * Silkeborgs udetrøje også er hvid. Uløste par gik fra 2 til 9 af 132.
 *
 * At vælge den fjerneste er strengt bedre: er tredjefarven ren, vinder den som
 * før; er ingen af dem rene, tages den mindst dårlige i stedet for den, der
 * beviseligt er værst. Der findes stadig par, hvor begge er tætte — se
 * `superligaTeams2026.test.js`, som holder listen over dem.
 */
export function matchBadges(teams, home, away, styles) {
  const h = badgeFor(teams, home, styles, 'home');
  const a = badgeFor(teams, away, styles, 'away');
  if (!colorsClash(a.color, h.color)) return { h, a };
  const third = badgeFor(teams, away, styles, 'third');
  return {
    h,
    a: colorDistance(third.color, h.color) > colorDistance(a.color, h.color) ? third : a,
  };
}

/**
 * Klubfarverne til en spillers avatar — hjemmetrøjen for det valgte hold.
 *
 * Returnerer `null`, når spilleren ikke har valgt et hold, ELLER når navnet
 * ikke findes i spillets holdliste. Det sidste er ikke en teoretisk gren:
 * `gameStandings.js` falder tilbage på brugerens GLOBALE yndlingshold, som for
 * en migreret Tour-bruger er et CYKELHOLD ("Visma", "UAE"). Uden opslaget ville
 * en spiller arve en farve fra et helt andet spil — og `badgeFor` ville
 * beredvilligt give grå til et navn, den ikke kender, i stedet for ingenting.
 *
 * @param {Array} teams   spillets holdliste (fra `teamsOf`)
 * @param {object} styles games/{id}.teamStyles
 * @param {string|null} holdnavn
 * @returns {{primaer: string, sekundaer: string|null, navn: string}|null}
 */
export function klubFarverAf(teams, styles, holdnavn) {
  if (!holdnavn) return null;
  if (!teamInfo(teams, holdnavn)) return null;
  const b = badgeFor(teams, holdnavn, styles, 'home');
  return { primaer: b.color, sekundaer: b.color2, navn: b.navn };
}

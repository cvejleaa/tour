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

import { teamInfo, listeHarLandeflag } from './teamInfo';
import { colorsClash, colorDistance, kuloer } from '../../../lib/contrastText';
import { KULOER_GULV } from '../../../lib/accentTema';

/** Farven for et hold, vi intet ved om. Ikke sort: sort er en ægte trøjefarve. */
export const GREY = '#5b6b7a';

/** Kæden for én variant — override først, så holdlisten, aldrig grå. */
function farveKaede(info, ov, variant) {
  if (variant === 'away') return ov.awayColor || info?.awayColor || info?.color || null;
  if (variant === 'third') return ov.thirdColor || info?.thirdColor || info?.awayColor || info?.color || null;
  return ov.color || info?.color || null;
}

/**
 * Holdets EGEN farve for en variant (admin-override eller holdlisten) —
 * null, når holdet ingen har. Forskellen til `badgeFor(...).color` er netop
 * grå: en badge SKAL have en farve og får GREY, men en ring eller et tema
 * må ikke opfinde én. `#5b6b7a` har i øvrigt kulør 0,12 — over
 * `KULOER_GULV` — så et hold uden farver fik før et gråblåt TEMA, ikke
 * «ingen tone». Kæden står ét sted, så badgen og ringen ikke kan følge
 * hver sin.
 */
export function egenFarve(teams, name, styles, variant = 'home') {
  return farveKaede(teamInfo(teams, name), styles?.[name] || {}, variant);
}

/**
 * Badge-info for et hold: klub-kortkode + farve + stadion.
 * variant 'home' | 'away' | 'third'. Admin-override (games/{id}.teamStyles)
 * vinder over standardfarven; hver variant falder pænt tilbage.
 */
export function badgeFor(teams, name, styles = {}, variant = 'home') {
  const info = teamInfo(teams, name);
  const farve = farveKaede(info, styles?.[name] || {}, variant) || GREY;
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
    color: farve,
    venue: info?.venue ?? null,
    color2: form.sekundaer ?? null,
    moenster: form.moenster ?? null,
    aerme: form.aerme ?? null,
    // LANDEFLAGET, når spillet har flag (lagt på af `teamsOf`, alt eller
    // intet). Et navn uden for holdlisten får null og tegnes som den grå
    // trøje — det kan i dag ikke ske (kampe oprettes kun med kendte hold),
    // men en pladsholder som «Vinder gruppe A» ville stå sådan.
    flag: info?.flag ?? null,
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
 * I et flag-spil er sekundærfarven landets anden farve — se `sekundaerAf`.
 *
 * @returns {{primaer: string, sekundaer: string|null, navn: string}|null}
 */
export function klubFarverAf(teams, styles, holdnavn) {
  if (!holdnavn) return null;
  if (!teamInfo(teams, holdnavn)) return null;
  // INGEN EGEN FARVE → INGEN RING. Samme regel som `klubAccentAf` nedenfor
  // («hellere ingen tone end en grå»): `badgeFor` giver GREY for et hold uden
  // farve, og en grå ring ligner en rigtig farve. Det var ikke teori — alle 32
  // hold i håndbold-VM'et stod uden farve og ville have givet hver spiller en
  // grå ring lige ved siden af et landeflag (QC på flagplanen, fund 1).
  if (!egenFarve(teams, holdnavn, styles, 'home')) return null;
  const b = badgeFor(teams, holdnavn, styles, 'home');
  return { primaer: b.color, sekundaer: sekundaerAf(teams, styles, holdnavn, b), navn: b.navn };
}

/**
 * Ringens SEKUNDÆRFARVE. I et klubspil er det trøjens (`troejer.hjemme.
 * sekundaer`) — Randers' skråbånd. Et flag-spil har ingen trøjeform, så dér
 * var sekundærfarven altid null, og ringen var ensfarvet: Danmark, Norge,
 * Tyskland, Kroatien og Portugal stod alle i rødt og kunne ikke skelnes i
 * stillingen (Spilfører på flag-koden). Landets ANDEN flagfarve (`awayColor`,
 * læst i flaget — haandboldVm2027Hold.js) skiller dem: rød/hvid, rød/blå,
 * rød/guld.
 *
 * Gaten er evnen (`listeHarLandeflag`, samme som `harLandeflag`), ikke
 * `sport` eller «har awayColor»: Superligaens og Premier Leagues klubber HAR
 * awayColor (udetrøjen), og den må ikke blive til en stribe i deres ring.
 * Udefarven går gennem `egenFarve`, så en admin-rettelse slår igennem som på
 * primærfarven; er den den samme som primærfarven, er der ingen anden farve.
 */
function sekundaerAf(teams, styles, holdnavn, b) {
  if (!listeHarLandeflag(teams)) return b.color2;
  const anden = egenFarve(teams, holdnavn, styles, 'away');
  return anden && anden.toUpperCase() !== b.color.toUpperCase() ? anden : null;
}

/**
 * KLUBFARVEN — den ene farve, en hel side kan tones med.
 *
 * DEN ER IKKE DEN SAMME SOM TRØJEFARVEN OVENFOR, og det er hele pointen med at
 * de to funktioner står ved siden af hinanden. `klubFarverAf` svarer på "hvilken
 * trøje spiller de i" og skal derfor sige HVID om FCK, for det er trøjen. Et
 * tema kan ikke bruge hvid til noget: den er ikke en farve, man kan skrive med
 * eller fylde en knap med, og lysnet eller mørknet bliver den bare grå.
 *
 * Derfor spørger den her funktion om noget andet: hvilken KULØR har klubben?
 * Svaret er den første af de tre trøjer, der overhovedet bærer en kulør — målt
 * med `kuloer` mod `KULOER_GULV`. Rækkefølgen hjemme → ude → tredje er ikke
 * vilkårlig: den følger, hvor tæt trøjen ligger på klubbens identitet.
 *
 * Hvad det giver i praksis. Tallene kommer fra `scripts/accent-tema.mjs --kuloer`,
 * som printer kulør for alle tre trøjer og markerer den valgte — gulvet stod
 * ellers som en påstand, og det kunne flyttes til både 0,01 og 0,20 med hele
 * suiten grøn (se `spilTemaFlader.test.jsx`, som binder begge sider af det):
 *   FC Midtjylland  #0B0807 (kulør 0,016) → hvid (0) → #E4002B fra tredjetrøjen
 *   F.C. København   hvid → #0A2240 fra udetrøjen
 *   AGF              hvid → #004C9B fra udetrøjen
 *   Newcastle       hvid → #101F35 (kulør 0,145) — marineblå, netop over gulvet
 *
 * Og `null`, når INGEN af de tre bærer kulør. Det sker: Crystal Palace står i
 * datafilen med hvid, næsten sort og hvid igen. Så beholder spillet app-grøn —
 * hellere ingen tone end en grå, der ligner en fejl.
 *
 * @returns {string|null} hex
 */
export function klubAccentAf(teams, styles, holdnavn) {
  if (!holdnavn) return null;
  if (!teamInfo(teams, holdnavn)) return null;
  for (const variant of ['home', 'away', 'third']) {
    // EGEN farve, ikke badgens: badgens grå (#5b6b7a, kulør 0,12) ligger over
    // gulvet og tonede før hele siden gråblå for et hold uden farver.
    // (null har kulør 0, så det falder igennem uden et ekstra tjek.)
    const farve = egenFarve(teams, holdnavn, styles, variant);
    if (kuloer(farve) >= KULOER_GULV) return farve;
  }
  return null;
}

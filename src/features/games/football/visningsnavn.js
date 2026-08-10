/**
 * VISNINGSNAVN — det navn, spilleren ser. Ikke det navn, data matches på.
 *
 * `name` på et hold er den EKSAKTE streng fra pulselive og api.superliga.dk.
 * Den er nøglen: resultater, Elo-opslag og kampprogram hænger på den, og
 * `teamElo()` falder TAVST tilbage til 1500 for et navn, den ikke kender. Den
 * må derfor aldrig røres for at få noget til at se pænere ud.
 *
 * Skærmen har et andet behov. Målt med `node scripts/navnbredde.mjs`:
 * "Brighton and Hove Albion" er det eneste af de 32 holdnavne, der stadig
 * klippes på en telefon i portræt — det er helt først fra 330 px, altså ikke på
 * en iPhone SE af første slags. Og "Tottenham Hotspur" og "Sønderjyske
 * Fodbold" fylder to linjer, hvor ingen siger andet end "Tottenham" og
 * "Sønderjyske" i daglig tale.
 *
 * HVORFOR IKKE BARE KORTKODEN. Det var den første løsning, og den faldt på
 * noget, ingen måling kunne fange: spillerne ved ikke, hvad forkortelserne
 * betyder. "SJF" og "VFF" er ikke almenviden. Et kortere NAVN er noget andet
 * end en kode — "Brighton" skal ikke slås op.
 *
 * Standardnavnene herunder er forslag. De kan overskrives pr. spil i
 * Admin → 🎨 Hold-farver og navne, som er stedet, man går hen for at justere, hvordan
 * et hold ser ud.
 */

/**
 * Klubber, hvor dagligtalen er kortere end det officielle navn.
 * Kun de fire: et visningsnavn, der ikke sparer en linje, er støj.
 */
export const VISNINGSNAVN = {
  'Brighton and Hove Albion': 'Brighton',
  'Tottenham Hotspur': 'Tottenham',
  'Sønderjyske Fodbold': 'Sønderjyske',
  'FC Nordsjælland': 'Nordsjælland',
};

/**
 * Længste visningsnavn, der kommer på skærmen.
 *
 * Tallet er `maxLength` på admin-feltet, men LOFTET HØRER HJEMME HER, ikke i
 * inputtet: `firestore.rules` gav længe `isGlobalAdmin()` fri skriveadgang til
 * hele spil-dokumentet uden at kigge på indholdet, så et navn på 10 000 tegn
 * kunne skrives direkte fra konsollen. Reglen håndhæver det nu også, men
 * klienten må ikke stole på, at den gør — og et loft ét sted her gælder ALLE
 * flader, også dem, der bliver skrevet i morgen.
 *
 * Det var nødvendigt: `.mytips__match` og `.sltab__name` har ingen klipning i
 * CSS, så én række i tipshistorikken eller stillingen kunne vokse til
 * hundredvis af linjer for alle i spillet.
 */
export const MAKS_VISNINGSNAVN = 40;

/** Husets forslag for ét hold — eller navnet selv, hvis der ikke er et. */
export function standardVisningsnavn(navn) {
  return VISNINGSNAVN[navn] || navn;
}

/**
 * Det navn, der skal på skærmen: spillets egen override, ellers husets forslag,
 * ellers det eksakte navn.
 *
 * En tom eller blank override tæller IKKE som en override — ellers kunne et
 * hold ende med at hedde ingenting, fordi nogen ryddede feltet i stedet for at
 * trykke nulstil.
 *
 * `typeof o === 'string'` er ikke pedanteri. Firestore gemmer, hvad der bliver
 * skrevet, og et OBJEKT i feltet giver "Objects are not valid as a React child"
 * — altså hvidt skærmbillede for alle i spillet, ikke bare et grimt navn.
 *
 * Det RÅ navn klippes bevidst ikke: det kommer fra vores egen holdliste, og et
 * afkortet "Brighton and Hove Alb" ville være værre end det, der står.
 */
export function visningsnavn(teamStyles, navn) {
  const o = teamStyles?.[navn]?.visningsnavn;
  if (typeof o === 'string' && o.trim()) return o.trim().slice(0, MAKS_VISNINGSNAVN);
  return standardVisningsnavn(navn);
}

/**
 * Læg `vis` på hvert hold i listen. Resultatet CACHES pr. (teams, teamStyles),
 * så gentagne kald giver det SAMME array-objekt.
 *
 * Uden cachen ville `teamsOf()` returnere en ny liste ved hver render, og hver
 * `useMemo`, der har den som dependency, ville regne forfra — inklusive
 * kampkortenes badges. Det er også derfor, den ikke bare er en `.map()` på
 * brugsstedet.
 */
const cache = new WeakMap();
export function medVisningsnavn(teams, teamStyles) {
  if (!Array.isArray(teams) || teams.length === 0) return teams;
  let pr = cache.get(teams);
  if (!pr) { pr = new Map(); cache.set(teams, pr); }
  // teamStyles er et almindeligt objekt fra Firestore og skifter identitet ved
  // hver snapshot — nøglen er derfor dens indhold, ikke dens reference.
  const noegle = JSON.stringify(teamStyles || null);
  const truffet = pr.get(noegle);
  if (truffet) return truffet;
  const ud = teams.map((t) => ({ ...t, vis: visningsnavn(teamStyles, t.name) }));
  pr.set(noegle, ud);
  return ud;
}

/**
 * VISNINGSNAVN — det navn, spilleren ser. Ikke det navn, data matches på.
 *
 * `name` på et hold er den EKSAKTE streng fra pulselive og api.superliga.dk.
 * Den er nøglen: resultater, Elo-opslag og kampprogram hænger på den, og
 * `teamElo()` falder TAVST tilbage til 1500 for et navn, den ikke kender. Den
 * må derfor aldrig røres for at få noget til at se pænere ud.
 *
 * Skærmen har et andet behov. "Brighton and Hove Albion" er det eneste af de
 * 32 holdnavne, der stadig klippes på en telefon — målt med
 * `node scripts/navnbredde.mjs` — og "Tottenham Hotspur" og "Sønderjyske
 * Fodbold" fylder to linjer, hvor ingen siger andet end "Tottenham" og
 * "Sønderjyske" i daglig tale.
 *
 * HVORFOR IKKE BARE KORTKODEN. Det var den første løsning, og den faldt på
 * noget, ingen måling kunne fange: spillerne ved ikke, hvad forkortelserne
 * betyder. "SJF" og "VFF" er ikke almenviden. Et kortere NAVN er noget andet
 * end en kode — "Brighton" skal ikke slås op.
 *
 * Standardnavnene herunder er forslag. De kan overskrives pr. spil i
 * Admin → 🎨 Hold-farver, som er stedet, man går hen for at justere, hvordan
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
 */
export function visningsnavn(teamStyles, navn) {
  const o = teamStyles?.[navn]?.visningsnavn;
  if (typeof o === 'string' && o.trim()) return o.trim();
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

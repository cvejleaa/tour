// ---------------------------------------------------------------------------
// LANDEFLAGENE — bundtet som selvstændige, hashede filer. Ingen kald til
// tredjepart.
//
// HVORFOR IMPORTER OG IKKE public/. `firebase.json` rewriter `**` til
// index.html, så et flag i public/ med en tastefejl i navnet giver 200 + HTML
// — et tavst brudt billede. En import af en fil, der ikke findes, fejler ved
// BUILD. Derfor 32 eksplicitte importer og ikke `import.meta.glob`, som bare
// ville matche færre filer uden at sige det.
//
// HVORFOR IKKE INLINET. Vite inliner assets under 4096 B som data-URI'er i det
// modul, der importerer dem; 25 af de 32 flag er under grænsen, og GamePage
// er ikke lazy (App.jsx), så de ville lande i hovedbundtet for begge apps og
// for hver SL/PL-spiller. `assetsInlineLimit` i vite.config.js siger nej for
// flag-icons (scripts/lib/assetsInline.mjs). Målingen: scripts/maal-flag.mjs.
//
// HVORFOR <img> OG ALDRIG INLINE-SVG. Et svg i <img> kan ikke køre script og
// kan ikke dele klip-id'er med resten af siden (rs.svg har id="rs-a"). Kun
// filerne importeres — aldrig pakkens CSS eller JS.
//
// Licens: flag-icons er MIT (© Panayiotis Lipiridis); notitsen ligger i
// public/licenser.txt, fordi Vite ikke skriver en licensfil for assets.
//
// Hvilke koder, der findes, og om et spil har flag, afgøres i
// `landeflagKoder.js` (rene funktioner, som også node-scripts kan læse).
// ---------------------------------------------------------------------------

import ao from 'flag-icons/flags/4x3/ao.svg';
import ar from 'flag-icons/flags/4x3/ar.svg';
import bh from 'flag-icons/flags/4x3/bh.svg';
import br from 'flag-icons/flags/4x3/br.svg';
import cl from 'flag-icons/flags/4x3/cl.svg';
import cv from 'flag-icons/flags/4x3/cv.svg';
import de from 'flag-icons/flags/4x3/de.svg';
import dk from 'flag-icons/flags/4x3/dk.svg';
import dz from 'flag-icons/flags/4x3/dz.svg';
import eg from 'flag-icons/flags/4x3/eg.svg';
import es from 'flag-icons/flags/4x3/es.svg';
import fo from 'flag-icons/flags/4x3/fo.svg';
import fr from 'flag-icons/flags/4x3/fr.svg';
import gr from 'flag-icons/flags/4x3/gr.svg';
import hr from 'flag-icons/flags/4x3/hr.svg';
import is from 'flag-icons/flags/4x3/is.svg';
import it from 'flag-icons/flags/4x3/it.svg';
import jp from 'flag-icons/flags/4x3/jp.svg';
import kw from 'flag-icons/flags/4x3/kw.svg';
import mk from 'flag-icons/flags/4x3/mk.svg';
import no from 'flag-icons/flags/4x3/no.svg';
import pl from 'flag-icons/flags/4x3/pl.svg';
import pt from 'flag-icons/flags/4x3/pt.svg';
import qa from 'flag-icons/flags/4x3/qa.svg';
import rs from 'flag-icons/flags/4x3/rs.svg';
import sa from 'flag-icons/flags/4x3/sa.svg';
import se from 'flag-icons/flags/4x3/se.svg';
import si from 'flag-icons/flags/4x3/si.svg';
import tn from 'flag-icons/flags/4x3/tn.svg';
import tr from 'flag-icons/flags/4x3/tr.svg';
import us from 'flag-icons/flags/4x3/us.svg';
import uy from 'flag-icons/flags/4x3/uy.svg';
import { alleHarLandeflag, harFlagKode } from './landeflagKoder';

/** iso2 → flagets URL (en hashet fil under /assets/ i buildet). */
export const LANDEFLAG = Object.freeze({
  ao, ar, bh, br, cl, cv, de, dk, dz, eg, es, fo, fr, gr, hr, is,
  it, jp, kw, mk, no, pl, pt, qa, rs, sa, se, si, tn, tr, us, uy,
});

/**
 * Flagets URL for en kode — null for alt, der ikke er et bundtet flag.
 * Spørger `harFlagKode` først, så 'constructor' aldrig når opslaget.
 */
export function flagSrc(iso2) {
  return harFlagKode(iso2) ? (LANDEFLAG[iso2] || null) : null;
}

/**
 * Læg `flag` på hvert hold: flagets URL, når ALLE har et (alt eller intet),
 * ellers null på hvert hold — og så tegnes alle som trøjer.
 *
 * `flag` SÆTTES ALTID, også til null. Feltet læses af badge-fladerne som en
 * billed-URL, og et `flag`, der stod i spil-dokumentet i forvejen, ville
 * ellers gå uændret igennem til <img src> — et kald til en vilkårlig vært.
 * Værdien kommer derfor kun fra bundtet (`LANDEFLAG`), aldrig fra data.
 *
 * CACHET PÅ LISTENS IDENTITET. `teamsOf` kalder den med medVisningsnavn's
 * cachede array, så samme (teams, teamStyles) giver det SAMME array-objekt
 * igen — ellers ville hver useMemo med holdlisten som afhængighed regne
 * forfra ved hver render, inkl. kampkortenes badges.
 */
const cache = new WeakMap();
export function medLandeflag(teams) {
  if (!Array.isArray(teams) || teams.length === 0) return teams;
  let ud = cache.get(teams);
  if (!ud) {
    const alle = alleHarLandeflag(teams);
    ud = teams.map((t) => ({ ...t, flag: alle ? flagSrc(t.iso2) : null }));
    cache.set(teams, ud);
  }
  return ud;
}

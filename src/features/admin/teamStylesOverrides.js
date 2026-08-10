/**
 * Hvad der FAKTISK gemmes, når admin trykker "Gem farver og navne".
 *
 * Ligger uden for komponenten, fordi reglerne herunder ikke er visning: de
 * afgør, hvad der står i `games/{id}.teamStyles` bagefter, og de kunne ikke
 * testes uden at rendere hele fanen. Mutationstesten kunne sætte HELE
 * TeamStylesTab til `return null` med grøn suite — filen blev ikke indlæst af
 * en eneste test.
 */
import { standardVisningsnavn } from '../games/football/visningsnavn';

const isHex6 = (s) => /^#[0-9a-fA-F]{6}$/.test(s);
const eq = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();

/**
 * Byg det overrides-objekt, der skrives til spillet.
 *
 * KUN AFVIGELSER GEMMES. Det er ikke en optimering, men en ejerskabsregel:
 * gemmer man husets eget forslag som en override, er spillet permanent frosset
 * mod fremtidige rettelser i `VISNINGSNAVN` og i holdlisten — og ingen kan se
 * på dokumentet, at valget aldrig blev truffet. Samme grund til, at et TOMT
 * felt betyder "brug forslaget" og ikke "intet navn".
 *
 * @param {Array<{name:string,color?:string,awayColor?:string,thirdColor?:string}>} teams
 * @param {Record<string, {visningsnavn?:string,color?:string,awayColor?:string,thirdColor?:string}>} styles
 * @returns {Record<string, object>} holdnavn → kun de felter, der afviger
 */
export function byggOverrides(teams, styles) {
  const out = {};
  for (const t of teams || []) {
    const s = (styles || {})[t.name] || {};
    const o = {};
    if (isHex6(s.color) && !eq(s.color, t.color)) o.color = s.color;
    if (isHex6(s.awayColor) && !eq(s.awayColor, t.awayColor)) o.awayColor = s.awayColor;
    if (isHex6(s.thirdColor) && !eq(s.thirdColor, t.thirdColor)) o.thirdColor = s.thirdColor;
    const vn = String(s.visningsnavn || '').trim();
    if (vn && vn !== standardVisningsnavn(t.name)) o.visningsnavn = vn;
    if (Object.keys(o).length) out[t.name] = o;
  }
  return out;
}

/** Farvefelterne, i den rækkefølge de står i fanen, med deres etiket. */
export const FARVEFELTER = [
  ['color', 'Hjemme'],
  ['awayColor', 'Ude'],
  ['thirdColor', '3. farve'],
];

/**
 * Farvefelter, der er UDFYLDT, men ikke er en gyldig 6-cifret hex.
 *
 * DET HER VAR EN TAVS SLETNING. `byggOverrides` springer et ugyldigt felt over,
 * og det var harmløst, dengang `setTeamStyles` brugte `setDoc(merge: true)` —
 * så blev den gamle værdi bare stående. Nu ERSTATTER `updateDoc` hele mappet,
 * så en halvskrevet hex som `#12345` sletter holdets gemte farve i Firestore,
 * mens fladen kvitterer med "gemt. De slår igennem med det samme".
 *
 * En tavs no-op blev altså til et tavst tab. Derfor navngives feltet i stedet,
 * og der gemmes ikke.
 *
 * @returns {Array<{hold:string, felt:string, vaerdi:string}>} tomt, hvis alt er gyldigt
 */
export function ugyldigeFarver(teams, styles) {
  const ud = [];
  for (const t of teams || []) {
    const s = (styles || {})[t.name] || {};
    for (const [key, etiket] of FARVEFELTER) {
      const v = String(s[key] ?? '').trim();
      // Et TOMT felt er ikke en fejl — det betyder "brug holdets standardfarve",
      // præcis som et tomt navnefelt betyder "brug forslaget".
      if (v && !isHex6(v)) ud.push({ hold: t.name, felt: etiket, vaerdi: v });
    }
  }
  return ud;
}

/**
 * Usynlige tegn, der ellers ville snige to identiske navne forbi dublet-tjekket.
 * Zero-width space/non-joiner/joiner, BOM og de fem retnings-styretegn.
 */
const USYNLIGE = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;

/**
 * De VISTE navne, som to eller flere hold ville dele.
 *
 * "Manchester" til både City og United er ikke en tastefejl, browseren fanger —
 * den ser rigtig ud i feltet og bliver først til et problem på kampkortet, hvor
 * to forskellige kampe pludselig ser ens ud. Præcis den forveksling, kortkoden
 * i sin tid blev indført for at undgå.
 *
 * Sammenlignes på det, ØJET ser: uden hensyn til store/små bogstaver, uden
 * omkringstående mellemrum, og uden usynlige tegn. Uden det sidste ville det
 * samme navn med et zero-width-tegn klistret bagpå tælle som et ANDET navn og
 * slippe forbi advarslen, selv om de to er umulige at skelne på skærmen.
 * NFKC først, så fx en halvbreddeform ikke tæller som noget andet end sin
 * almindelige form.
 *
 * @returns {Array<{navn:string, hold:string[]}>} tomt array, hvis alt er unikt
 */
export function dubletter(teams, styles) {
  const set = new Map(); // nøgle → { navn, hold[] }
  for (const t of teams || []) {
    const s = (styles || {})[t.name] || {};
    const vn = String(s.visningsnavn || '').trim() || standardVisningsnavn(t.name);
    const noegle = vn.normalize('NFKC').replace(USYNLIGE, '').trim().toLocaleLowerCase('da');
    if (!set.has(noegle)) set.set(noegle, { navn: vn, hold: [] });
    set.get(noegle).hold.push(t.name);
  }
  return [...set.values()].filter((d) => d.hold.length > 1);
}

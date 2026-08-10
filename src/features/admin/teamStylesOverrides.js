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

/**
 * De VISTE navne, som to eller flere hold ville dele.
 *
 * "Manchester" til både City og United er ikke en tastefejl, browseren fanger —
 * den ser rigtig ud i feltet og bliver først til et problem på kampkortet, hvor
 * to forskellige kampe pludselig ser ens ud. Præcis den forveksling, kortkoden
 * i sin tid blev indført for at undgå.
 *
 * Sammenlignes uden hensyn til store/små bogstaver og omkringstående mellemrum:
 * "brighton" og "Brighton " er samme navn på skærmen.
 *
 * @returns {Array<{navn:string, hold:string[]}>} tomt array, hvis alt er unikt
 */
export function dubletter(teams, styles) {
  const set = new Map(); // nøgle → { navn, hold[] }
  for (const t of teams || []) {
    const s = (styles || {})[t.name] || {};
    const vn = String(s.visningsnavn || '').trim() || standardVisningsnavn(t.name);
    const noegle = vn.toLocaleLowerCase('da');
    if (!set.has(noegle)) set.set(noegle, { navn: vn, hold: [] });
    set.get(noegle).hold.push(t.name);
  }
  return [...set.values()].filter((d) => d.hold.length > 1);
}

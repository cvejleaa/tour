// CI-vagt: en ny knap eller et nyt felt uden en test, der rører det, kan
// ikke merges ubemærket. Køres i ci.yml EFTER suiten er kørt med EVNE_LOG.
//
// VAGTEN KRÆVER IKKE 100 % — DEN LÅSER BASISLINJEN. flade-basislinje.json
// rummer de kendte urørte elementer. Rødt, hvis:
//   1. tappen loggede ingenting (så ville alt se urørt ud — det er en fejl i
//      kørslen, ikke et resultat),
//   2. der er et NYT urørt element, som hverken står i basislinjen eller i
//      flade-undtagelser.json,
//   3. et element i basislinjen er blevet rørt eller er væk — basislinjen
//      kan kun skrumpe, og den skal skrumpe med det samme (`--opdater`),
//      ellers står der forældede poster, som kan skjule et nyt hul senere,
//   4. en undtagelse mangler en begrundelse (ellers bliver listen en losseplads).
//
// KUN VITEST-LOGGEN. E2E-klik tælles med i fanens øjebliksbillede (den
// ugentlige kørsel), men ikke her: E2E kører i sit eget CI-job, og vagten
// ser kun frontend-jobbets log. Et element, som KUN en Playwright-spec rører,
// hører derfor i flade-undtagelser.json med begrundelsen "dækket af
// e2e/…spec.js". Det er en bevidst pris for at holde vagten i ét job.
//
// IDENTITET UDEN LINJETAL. Basislinjen bruger (fil, komponent, tag, tekst,
// nummer) — ikke fil:linje:kolonne. Linjetal flytter sig ved enhver
// redigering ovenfor, og så ville hver eneste PR i en fil melde alle dens
// urørte elementer som nye. Nummeret skelner identiske tupler (104 af 443
// elementer deler tuple med et andet, målt 3/9 2026).
//
// KENDT BEGRÆNSNING (QC): indsættes en NY identisk knap FØR en kendt urørt
// makker i samme fil, skrider nummereringen — den nye arver #1 og glider
// igennem, mens den gamle meldes som ny. CI er stadig rød, men på den forkerte
// post. Derfor printer `--opdater` PRÆCIS hvilke nøgler der kommer til og
// går ud, så diffen kan læses, før den committes — læs den, ikke kun tallet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanTrae } from './scan-flade.mjs';
import { flet, laesLog } from './lib/fladeDaekning.mjs';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASISLINJE = path.join(ROD, 'scripts', 'flade-basislinje.json');
export const UNDTAGELSER = path.join(ROD, 'scripts', 'flade-undtagelser.json');

/** Stabile nøgler for hele inventaret, i kildeorden. */
export function stabileNoegler(elementer) {
  const taellere = new Map();
  return elementer.map((e) => {
    const tuple = [e.fil, e.komponent || '', e.tag, e.tekst || ''].join('|');
    const n = (taellere.get(tuple) || 0) + 1;
    taellere.set(tuple, n);
    return `${tuple}#${n}`;
  });
}

/**
 * @param {Array} elementer  fra flet().elementer (med aktiveret)
 * @param {number} logposter antal poster, tappen skrev
 * @param {string[]} basislinje  stabile nøgler for kendte urørte
 * @param {Array} undtagelser  [{ noegle, begrundelse, tilfoejet }]
 */
export function vagt(elementer, logposter, basislinje, undtagelser) {
  const fejl = [];
  const advarsler = [];
  // Tom log: KUN den fejl. Alt ville se urørt ud, og 170+ "nye urørte"-linjer
  // oven i ville drukne den ene besked, der forklarer hvad der er galt.
  if (!logposter) {
    fejl.push('Tappen loggede ingen interaktioner — suiten kørte uden EVNE_LOG, eller tappen er gået i stykker. Alt ville se urørt ud.');
    return { fejl, advarsler, basislinjeNu: [] };
  }
  for (const u of undtagelser) {
    if (!u || typeof u.noegle !== 'string' || !u.begrundelse || !String(u.begrundelse).trim()) {
      fejl.push(`Undtagelsen ${u && u.noegle ? u.noegle : JSON.stringify(u)} mangler en begrundelse.`);
    }
  }
  const noegler = stabileNoegler(elementer);
  const undtaget = new Set(undtagelser.map((u) => u && u.noegle));
  const kendt = new Set(basislinje);
  const uroerteNu = new Set();
  const nye = [];
  elementer.forEach((e, i) => {
    if (e.aktiveret) return;
    uroerteNu.add(noegler[i]);
    if (!kendt.has(noegler[i]) && !undtaget.has(noegler[i])) nye.push({ noegle: noegler[i], e });
  });
  for (const { noegle, e } of nye) {
    fejl.push(`Nyt urørt element: ${e.fil}:${e.linje} <${e.tag}>${e.tekst ? ` «${e.tekst}»` : ''} i ${e.komponent || '?'} (${noegle}). Skriv en test, der rører det — eller tilføj en begrundet undtagelse i scripts/flade-undtagelser.json.`);
  }
  const forsvundne = basislinje.filter((k) => !uroerteNu.has(k));
  if (forsvundne.length) {
    fejl.push(`${forsvundne.length} element(er) i basislinjen er nu rørt eller væk — basislinjen skal skrumpe: kør \`node scripts/flade-vagt.mjs --opdater\` og commit scripts/flade-basislinje.json.\n  ${forsvundne.join('\n  ')}`);
  }
  for (const k of undtaget) if (!uroerteNu.has(k)) advarsler.push(`Undtagelsen ${k} gælder et element, der nu er rørt eller væk — den kan fjernes.`);
  return { fejl, advarsler, basislinjeNu: [...uroerteNu].sort() };
}

/** Hvad `--opdater` ændrer: nøgler, der kommer til, og nøgler, der går ud. */
export function basislinjeDiff(gammel, ny) {
  const g = new Set(gammel);
  const n = new Set(ny);
  return { til: ny.filter((k) => !g.has(k)), fra: gammel.filter((k) => !n.has(k)) };
}

function laesJson(sti, fallback) {
  return fs.existsSync(sti) ? JSON.parse(fs.readFileSync(sti, 'utf8')) : fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const logDir = process.env.EVNE_LOG || path.join(ROD, '.evne-log');
  const poster = fs.existsSync(logDir)
    ? fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson')).flatMap((f) => laesLog(fs.readFileSync(path.join(logDir, f), 'utf8')))
    : [];
  const daekning = flet(scanTrae(ROD), poster);
  const basislinje = laesJson(BASISLINJE, { noegler: [] }).noegler;
  const undtagelser = laesJson(UNDTAGELSER, []);
  const r = vagt(daekning.elementer, poster.length, basislinje, undtagelser);
  if (process.argv.includes('--opdater')) {
    if (!poster.length) { console.error(r.fejl[0]); process.exit(1); }
    const d = basislinjeDiff(basislinje, r.basislinjeNu);
    fs.writeFileSync(BASISLINJE, `${JSON.stringify({ generatedAt: new Date().toISOString(), noegler: r.basislinjeNu }, null, 1)}\n`);
    for (const k of d.fra) console.log(`  − ${k}`);
    for (const k of d.til) console.log(`  + ${k}   ← NYT urørt element i basislinjen: er det med vilje?`);
    console.log(`Skrev ${BASISLINJE}: ${r.basislinjeNu.length} kendte urørte af ${daekning.elementer.length} (${daekning.totals.aktiverede} rørt, ${poster.length} logposter). ${d.til.length} kom til, ${d.fra.length} gik ud — læs listen, ikke kun tallet.`);
    process.exit(0);
  }
  for (const a of r.advarsler) console.warn(`⚠️  ${a}`);
  for (const f of r.fejl) console.error(`✖ ${f}`);
  console.log(`Fladen: ${daekning.totals.aktiverede} af ${daekning.totals.elementer} rørt, ${r.basislinjeNu.length} kendte urørte i basislinjen, ${poster.length} logposter.`);
  process.exit(r.fejl.length ? 1 : 0);
}

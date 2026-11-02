// ---------------------------------------------------------------------------
// scripts/lib/wikiHent.mjs — hent en Wikipedia-sides wikitekst. Høfligt.
//
// Bruges af scripts/haandbold-program.mjs og scripts/haandbold-historik.mjs.
// Ligger i sit eget modul, så reglerne for HVORDAN vi spørger Wikipedia står
// ét sted og er testet — ikke kopieret ind i to scripts, hvor den ene kunne
// glemme ventetiden eller User-Agenten.
//
// HVAD VI GØR, OG HVORFOR DET ER I ORDEN (Security skal vurdere det):
//   - MediaWiki API'et (`/w/api.php?action=parse&prop=wikitext`), ét kald pr.
//     side, startet MANUELT af en person. Intet kører af sig selv.
//   - robots.txt på en.wikipedia.org har `Disallow: /w/`. Det gælder crawlere,
//     der følger links; API'et under /w/ er netop den dør, Wikimedia beder
//     programmer bruge, og etiketten for det er: en beskrivende User-Agent med
//     en kontaktvej, ét kald ad gangen og ikke tættere end nødvendigt
//     (https://www.mediawiki.org/wiki/API:Etiquette og Wikimedias
//     User-Agent-politik). Vi venter mindst ét sekund mellem kald og cacher
//     svaret lokalt, så den samme side kun hentes én gang.
//   - User-Agenten peger på repoet, IKKE på ejerens e-mail: den står i
//     Wikimedias logs, og en personlig adresse har intet at gøre dér.
//   - Indholdet er CC BY-SA 4.0. Alt, vi gemmer af det (fixtures, program,
//     historik), bærer kildeangivelse og sidens revisions-id.
//
// HVAD DEN ALDRIG GØR: følger links, henter andet end wikitekst, eller
// sender noget andet end sidetitlen ud.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const WIKI_API = 'https://en.wikipedia.org/w/api.php';
export const USER_AGENT = 'VejleaaTip-program/1.0 (+https://github.com/cvejleaa/tour)';
export const MIN_PAUSE_MS = 1000;

/** Adressen for ét parse-kald. Titlen kodes af URLSearchParams — aldrig limet ind. */
export function wikiUrl(titel) {
  const q = new URLSearchParams({
    action: 'parse',
    page: titel,
    prop: 'wikitext|revid',
    redirects: '1',
    format: 'json',
    formatversion: '2',
  });
  return `${WIKI_API}?${q}`;
}

/** Filnavnet i cachen: titlen uden tegn, et filsystem kunne mistolke. */
export function cacheNavn(titel) {
  return `${String(titel).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}.json`;
}

/**
 * En henter med pause mellem kaldene. Pausen er bundet til HENTEREN, ikke til
 * modulet, så en test kan styre uret uden at påvirke en anden.
 *
 * @param {object} o
 * @param {Function} [o.fetchFn]  fetch-kompatibel (testene giver en falsk)
 * @param {string}   [o.cacheDir] mappe til svarene; uden: ingen cache
 * @param {Function} [o.nu]       () => ms   (testene)
 * @param {Function} [o.sov]      (ms) => Promise   (testene)
 * @param {Function} [o.log]
 */
export function lavWikiHenter({
  fetchFn = globalThis.fetch,
  cacheDir = null,
  nu = () => Date.now(),
  sov = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
} = {}) {
  let sidsteKald = -Infinity;

  /**
   * @param {string} titel  sidens titel, fx "2025 World Men's Handball Championship"
   * @returns {Promise<{titel: string, revid: number|null, hentet: string, wikitekst: string, fraCache: boolean}>}
   */
  return async function hentWikitekst(titel) {
    if (typeof titel !== 'string' || !titel.trim()) throw new Error('hentWikitekst: sidetitel mangler');
    const fil = cacheDir ? join(cacheDir, cacheNavn(titel)) : null;
    if (fil && existsSync(fil)) {
      const gemt = JSON.parse(readFileSync(fil, 'utf8'));
      if (typeof gemt?.wikitekst !== 'string' || !gemt.wikitekst) {
        throw new Error(`Cachen ${fil} har ingen wikitekst — slet filen og hent igen.`);
      }
      log(`  (cache) ${titel}`);
      return { ...gemt, fraCache: true };
    }

    const vent = sidsteKald + MIN_PAUSE_MS - nu();
    if (vent > 0) await sov(vent);
    sidsteKald = nu();

    const url = wikiUrl(titel);
    log(`  henter ${titel}`);
    const res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } });
    if (!res.ok) {
      // 429 = Wikimedia beder os vente. Vi prøver IKKE igen af os selv: et
      // script, der hamrer løs på en 429, er præcis det, etiketten forbyder.
      const vent = res.headers?.get?.('retry-after');
      throw new Error(`Wikipedia svarede HTTP ${res.status} på «${titel}». Intet er gemt. `
        + (res.status === 429
          ? `Wikimedia beder os vente${vent ? ` (Retry-After: ${vent} s)` : ''}. Prøv igen senere, eller gem siden i browseren og brug --fil.`
          : 'Prøv igen senere, eller brug --fil med en gemt kopi.'));
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(`Wikipedia afviste «${titel}»: ${data.error.code ?? '?'} — ${data.error.info ?? ''}`.trim());
    }
    const wikitekst = data?.parse?.wikitext;
    if (typeof wikitekst !== 'string' || !wikitekst.trim()) {
      throw new Error(`Svaret for «${titel}» har ingen wikitekst — API'ets form har ændret sig. Intet er gemt.`);
    }
    const ud = {
      titel: data.parse.title ?? titel,
      revid: Number.isInteger(data.parse.revid) ? data.parse.revid : null,
      hentet: new Date(nu()).toISOString(),
      wikitekst,
    };
    if (fil) {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(fil, JSON.stringify(ud));
    }
    return { ...ud, fraCache: false };
  };
}

/**
 * Argumenter med HVIDLISTE (samme grund som parseArgs i src/lib/seedFootball.js:
 * en stavefejl må aldrig sluges i stilhed — `--skrive` ville tørkøre, og det
 * opdager man; `--fill` ville hente fra nettet i stedet for at læse filen).
 * @param {string[]} argv
 * @param {{vaerdier?: string[], flag?: string[]}} kendte
 * @returns {{flag: Set<string>} & Record<string, string>}
 */
export function parseScriptArgs(argv, { vaerdier = [], flag = [] } = {}) {
  const ud = { flag: new Set() };
  const liste = argv || [];
  for (let i = 0; i < liste.length; i += 1) {
    const a = String(liste[i]);
    if (!a.startsWith('--')) throw new Error(`forstod ikke «${a}» — argumenter starter med --`);
    const navn = a.slice(2);
    const naeste = liste[i + 1];
    const harVaerdi = naeste !== undefined && !String(naeste).startsWith('--');
    if (vaerdier.includes(navn)) {
      if (!harVaerdi) throw new Error(`--${navn} mangler en værdi`);
      ud[navn] = String(naeste);
      i += 1;
    } else if (flag.includes(navn)) {
      if (harVaerdi) throw new Error(`--${navn} tager ingen værdi (fik «${naeste}»)`);
      ud.flag.add(navn);
    } else {
      throw new Error(`ukendt argument --${navn}. Kendte: ${[...vaerdier, ...flag].map((k) => `--${k}`).join(', ')}`);
    }
  }
  return ud;
}

/**
 * Læs en gemt side: enten et cache-svar (.json fra lavWikiHenter) eller rå
 * wikitekst (.wikitext/.txt, fx kopieret fra «Rediger kilde» i browseren).
 * @param {string} indhold  filens tekst
 * @param {string} navn     filnavnet (afgør formen)
 */
export function laesGemtSide(indhold, navn) {
  if (/\.json$/i.test(navn)) {
    const d = JSON.parse(indhold);
    if (typeof d?.wikitekst !== 'string' || !d.wikitekst) throw new Error(`${navn} er ikke et gemt svar (mangler wikitekst)`);
    return { titel: d.titel ?? null, revid: d.revid ?? null, hentet: d.hentet ?? null, wikitekst: d.wikitekst };
  }
  if (!/\{\{\s*handballbox/i.test(String(indhold))) throw new Error(`${navn} har ingen {{handballbox}} — er det den rigtige side?`);
  return { titel: null, revid: null, hentet: null, wikitekst: String(indhold) };
}

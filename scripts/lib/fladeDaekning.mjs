// Fletter inventaret (scan-flade.mjs) med tappens log (src/test/setup.js)
// til det øjebliksbillede, Admin → Tests → Fladen viser.
//
// KREDITREGLEN: en logpost bærer kæden af kildesteder fra det ramte
// DOM-element og OPAD gennem React-træet (fiber.return). Det NÆRMESTE
// kildested, der står i inventaret, får kreditten — og kun hvis elementet
// aktiveres af netop den hændelsestype. Ikke alle forfædre: så ville en
// <form> få point, hver gang nogen klikkede en knap inde i den. Et klik på
// en <span> inde i en knap krediterer knappen; et klik på en <span> inde i
// en <form> krediterer ingenting (form aktiveres af submit, ikke klik).
//
// EN LOGPOST UDEN INVENTAR-MATCH KREDITERER INTET. I målingen stod der 15+
// ikke-interaktive forældre-elementer i loggen; de falder på gulvet.
import { noegleFraDebugSource } from './evneNoegle.mjs';

/**
 * Hvilken gruppe hører filen til på fanen? Tour er et afsluttet spil og
 * foldes væk. 'andet' er en OBLIGATORISK fallback: en sti→gruppe-tabel uden
 * fallback taber elementer tavst, og fanen har en test på, at gruppesummen
 * er lig totalen.
 */
export function appFor(fil) {
  if (/^src\/features\/games\//.test(fil) || /^src\/pages\/Games?Page\.jsx$/.test(fil)) return 'platform';
  // onboarding, reactions og ligavæggen (LeagueWall) bruges KUN af Tour-siderne
  // (DashboardPage, LeaguesPage) — sporet af QC. EmojiPicker deles med
  // Beskeder og Profil og er derfor fælles.
  if (/^src\/features\/(tour|riders|stages|teams|leagues|bonus|live|dashboard|leaderboard|onboarding|reactions)\//.test(fil)) return 'tour';
  if (fil === 'src/features/comments/LeagueWall.jsx') return 'tour';
  if (fil === 'src/features/comments/EmojiPicker.jsx') return 'faelles';
  if (/^src\/pages\/(Dashboard|Stages|StagePresentation|Tour|Teams|Team|MyBets|Bonus|Leaderboard|Leagues)Page\.jsx$/.test(fil)) return 'tour';
  if (/^src\/(pages|components)\//.test(fil) || /^src\/features\/(admin|auth|profile)\//.test(fil) || /^src\/App\.jsx$/.test(fil)) return 'faelles';
  return 'andet';
}

/** Parser en NDJSON-log til poster; ugyldige linjer springes over. */
export function laesLog(tekst) {
  const ud = [];
  for (const l of tekst.split('\n')) {
    if (!l.trim()) continue;
    try { ud.push(JSON.parse(l)); } catch { /* halv linje fra en afbrudt kørsel */ }
  }
  return ud;
}

/**
 * @param {Array} inventar  fra scanTrae()
 * @param {Array} poster    logposter { type, kaede: [noegle…], test, testfil }
 * @param {object} [opt]    { generatedAt }
 */
export function flet(inventar, poster, opt = {}) {
  const prNoegle = new Map(inventar.map((p) => [p.noegle, p]));
  const tests = new Map(); // noegle → Set(testfil)
  for (const post of poster) {
    if (!post || !Array.isArray(post.kaede)) continue;
    const naermeste = post.kaede.find((k) => prNoegle.has(k));
    if (!naermeste) continue;
    const elem = prNoegle.get(naermeste);
    if (!elem.haendelser.includes(post.type)) continue;
    if (!tests.has(naermeste)) tests.set(naermeste, new Set());
    if (post.testfil) tests.get(naermeste).add(post.testfil);
  }
  const elementer = inventar.map((p) => {
    const t = tests.get(p.noegle);
    return {
      fil: p.fil, linje: p.linje, kolonne: p.kolonne, tag: p.tag, type: p.type, tekst: p.tekst,
      komponent: p.komponent || null,
      app: appFor(p.fil),
      aktiveret: Boolean(t),
      tests: t ? [...t].sort() : [],
    };
  });
  const aktiverede = elementer.filter((e) => e.aktiveret).length;
  return {
    generatedAt: opt.generatedAt || new Date().toISOString(),
    // E2E-klik (Playwright) tælles ikke med endnu. Fanen renderer sit
    // forbehold og ordet "Mindst" ud fra dette flag — ikke fra en hardkodet
    // sætning — så det forsvinder af sig selv, den dag tællingen er bygget.
    e2eMedregnet: Boolean(opt.e2eMedregnet),
    totals: { elementer: elementer.length, aktiverede, logposter: poster.length, filer: new Set(elementer.map((e) => e.fil)).size },
    elementer,
  };
}

/** Kæden af kildesteder fra et DOM-element og opad — bruges af tappen. */
export function kildeKaede(el, rod, maks = 12) {
  const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
  let fiber = k ? el[k] : null;
  const ud = [];
  for (let i = 0; fiber && i < maks; i++) {
    const n = noegleFraDebugSource(fiber._debugSource, rod);
    if (n) ud.push(n);
    fiber = fiber.return;
  }
  return ud;
}

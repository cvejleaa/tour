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
//
// RENDER-POSTER ER DEN MODSATTE REGEL. En post af typen 'render' (fra
// MutationObserver-tappen: elementet kom ind i DOM'en) krediterer ALLE nøgler
// i kæden, der står i inventaret — en <span> inde i en knap inde i en form
// beviser, at både knap og form blev tegnet. Den går UDEN OM hændelses-gaten
// (ingen inventar-hændelse hedder 'render'; uden forbigåelsen krediterede en
// render-post nul, og hele fladen stod som «aldrig vist» — QC-fund på
// planen). Render-poster tæller IKKE i `aktiveret`, kun i `renderet`.
import { noegleFraDebugSource } from './evneNoegle.mjs';

/**
 * Hændelserne, der AKTIVERER et element — den ene kilde til listen. Tappen
 * (src/test/setup.js), E2E-init-scriptet (e2e/fixtures/evneKaede.mjs),
 * fletningen og tom-log-vagterne læser alle herfra: kun poster af disse typer
 * beviser, at en test rørte noget. 'render' står med vilje IKKE her — ellers
 * ville en død klik-tap gemme sig bag en levende render-tap i "loggen er
 * ikke tom" (QC-fund).
 */
export const HAENDELSER = ['click', 'input', 'change', 'submit'];

/** Antal poster, der beviser en interaktion — det tal, tom-log-vagterne skal se på. */
export function antalInteraktioner(poster) {
  return (poster || []).filter((p) => p && HAENDELSER.includes(p.type)).length;
}

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
  const tests = new Map(); // noegle → Set(testfil)  — rørt
  const vist = new Map();  // noegle → Set(testfil)  — renderet
  for (const post of poster) {
    if (!post || !Array.isArray(post.kaede)) continue;
    if (post.type === 'render') {
      for (const k of post.kaede) {
        if (!prNoegle.has(k)) continue;
        if (!vist.has(k)) vist.set(k, new Set());
        vist.get(k).add(post.testfil || '?');
      }
      continue;
    }
    if (!HAENDELSER.includes(post.type)) continue;
    const naermeste = post.kaede.find((k) => prNoegle.has(k));
    if (!naermeste) continue;
    const elem = prNoegle.get(naermeste);
    if (!elem.haendelser.includes(post.type)) continue;
    if (!tests.has(naermeste)) tests.set(naermeste, new Set());
    if (post.testfil) tests.get(naermeste).add(post.testfil);
  }
  const elementer = inventar.map((p) => {
    const t = tests.get(p.noegle);
    const v = vist.get(p.noegle);
    const aktiveret = Boolean(t);
    // Kun ANTALLET af render-tests gemmes: fanen viser aldrig listen for de
    // viste, og delte komponenter tegnes af snesevis af testfiler — listen
    // ville blæse den bundlede JSON op (QC).
    const renderAntal = v ? v.size : 0;
    return {
      fil: p.fil, linje: p.linje, kolonne: p.kolonne, tag: p.tag, type: p.type, tekst: p.tekst,
      komponent: p.komponent || null,
      app: appFor(p.fil),
      aktiveret,
      tests: t ? [...t].sort() : [],
      // `renderet` er afledt (status !== 'aldrig') og gemmes ikke: 443 × ét
      // felt er 10 KB i den bundlede JSON for ingenting.
      renderAntal,
      status: statusFor(aktiveret, renderAntal),
    };
  });
  const aktiverede = elementer.filter((e) => e.aktiveret).length;
  const renderede = elementer.filter((e) => e.status !== 'aldrig').length;
  return {
    generatedAt: opt.generatedAt || new Date().toISOString(),
    // Er E2E-klik (Playwright) med i loggen? build-test-report.mjs sætter
    // flaget, når E2E-kørslen lykkedes og loggede. Fanen renderer sit
    // forbehold og ordet "Mindst" ud fra flaget — ikke fra en hardkodet
    // sætning — så en kørsel uden E2E stadig siger sandheden.
    e2eMedregnet: Boolean(opt.e2eMedregnet),
    // `renderMaalt` siger, om render-tappen overhovedet var med i kørslen.
    // Uden det ville en gammel log (kun klik) vise alt urørt som «aldrig vist».
    renderMaalt: poster.some((p) => p && p.type === 'render'),
    totals: {
      elementer: elementer.length, aktiverede, renderede,
      logposter: poster.length, interaktioner: antalInteraktioner(poster),
      filer: new Set(elementer.map((e) => e.fil)).size,
    },
    elementer,
  };
}

/**
 * De tre tilstande, fanen viser. 'roert': en test klikkede/skrev.
 * 'vist': ingen rørte, men elementet kom ind i DOM'en i mindst én test.
 * 'aldrig': ingen test har nogensinde tegnet det — ingen vagt overhovedet.
 */
export function statusFor(aktiveret, renderAntal) {
  if (aktiveret) return 'roert';
  return renderAntal > 0 ? 'vist' : 'aldrig';
}

/**
 * INVARIANTEN, der beviser at render-tappen virker: man kan ikke klikke på
 * noget, der aldrig blev tegnet. Hvert aktiveret element skal være renderet
 * — ellers er observeren død eller filtrerer for hårdt, og «aldrig vist»
 * er falsk alarm. Returnerer de elementer, der bryder den (tom = OK).
 * Kun meningsfuld, når render er målt (renderMaalt); ellers bryder alt.
 */
export function renderBrud(daekning) {
  if (!daekning || !daekning.renderMaalt) return [];
  return daekning.elementer.filter((e) => e.aktiveret && !(e.renderAntal > 0));
}

/**
 * Hvor mange fiber-led opad tappen følger. Deles med browser-scriptet i
 * e2e/fixtures/evneKaede.mjs (en håndkopi af kildeKaede, fordi browseren ikke
 * kan importere Node-moduler) — én konstant, så de to ikke driver fra
 * hinanden. 12 rækker fra en <span> i en knap op gennem wrappers til Link.
 */
export const MAKS_KAEDE = 12;

/**
 * Render-tappens vandring: for et TILFØJET DOM-undertræ (MutationObserver)
 * findes alle nøgler i fiber-kæden for roden og hver efterkommer. React
 * appender et helt undertræ som ÉN mutation (roden appendes, når børnene er
 * bygget — målt af QC: en <form> med 6 efterkommere gav 1 addedNode), så
 * efterkommerne SKAL gås igennem. Nøglerne dedupleres i `set`; kalderen
 * afgør, hvad der er nyt. Ingen tag-filtrering: ethvert filter her skal være
 * en overmængde af scan-flade's interaktiv-prædikat, og under-rapportering
 * er falsk alarm i den alvorlige kategori — så der filtreres ikke.
 * @param {Element} rodEl
 * @param {string} rod
 * @param {Set<string>} set  fyldes med nøgler
 */
export function renderNoegler(rodEl, rod, set) {
  const alle = [rodEl];
  if (typeof rodEl.querySelectorAll === 'function') alle.push(...rodEl.querySelectorAll('*'));
  for (const el of alle) for (const k of kildeKaede(el, rod)) set.add(k);
  return set;
}

/** Kæden af kildesteder fra et DOM-element og opad — bruges af tappen. */
export function kildeKaede(el, rod, maks = MAKS_KAEDE) {
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

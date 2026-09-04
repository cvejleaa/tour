// E2E-halvdelen af fladedækningen (Admin → Tests → Knapper og felter).
//
// Vitest-tappen (src/test/setup.js) ser DOM'en i jsdom. Playwright ser den i
// en rigtig browser, og React-træet er kun tilgængeligt dér, hvis bundtet er
// bygget med React-dev-runtime — derfor bygger playwright.config.js med
// NODE_ENV=development, når EVNE_LOG er sat (målt 3/9 2026: 18 chunks med
// jsxDEV, index-chunken med _debugSource og absolutte filnavne).
//
// Browseren sender rå _debugSource-tripler (fileName absolut fra build-
// maskinen) til Node gennem en exposeBinding; konverteringen til nøglen
// fil:linje:kolonne sker HER i Node, med den samme evneNoegle-funktion som
// Vitest-siden. Én konvention, ét sted.
import { noegleFraDebugSource } from '../../scripts/lib/evneNoegle.mjs';
import { MAKS_KAEDE, HAENDELSER } from '../../scripts/lib/fladeDaekning.mjs';

export { HAENDELSER };

/** Scriptet, der injiceres i hver side før appens egen kode. Selvstændigt — intet import. */
export const INIT_SCRIPT = `(() => {
  const send = (post) => { try { window.__evneLog(JSON.stringify(post)); } catch (e) { /* ingen binding: ikke i tap-kørsel */ } };
  const kaede = (el) => {
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    let f = k ? el[k] : null;
    const ud = [];
    for (let i = 0; f && i < ${MAKS_KAEDE}; i++) {
      const s = f._debugSource;
      if (s && s.fileName) ud.push({ fileName: s.fileName, lineNumber: s.lineNumber, columnNumber: s.columnNumber });
      f = f.return;
    }
    return ud;
  };
  for (const type of ${JSON.stringify(HAENDELSER)}) {
    document.addEventListener(type, (e) => {
      const el = e.target;
      if (!el || el.nodeType !== 1) return;
      const kilder = kaede(el);
      if (kilder.length) send({ type, kilder });
    }, true);
  }
  // Render-tappen: hvad kom ind i DOM'en? Samme MutationObserver som
  // Vitest-siden. Nye kilder sendes SAMLET pr. callback (én bindings-rundtur,
  // ikke én pr. nøgle — QC), dedupleret pr. side, så antallet af kald er
  // begrænset af inventaret, ikke af DOM'ens størrelse. Records i kø, når
  // siden lukkes, tømmes på pagehide — tabte poster her er falsk «aldrig vist».
  const set = new Set();
  const noegleAf = (s) => s.fileName + ':' + s.lineNumber + ':' + s.columnNumber;
  const behandl = (records) => {
    const nye = [];
    for (const r of records) for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      const alle = [n];
      if (n.querySelectorAll) alle.push(...n.querySelectorAll('*'));
      for (const el of alle) for (const s of kaede(el)) {
        const k = noegleAf(s);
        if (!set.has(k)) { set.add(k); nye.push(s); }
      }
    }
    if (nye.length) send({ type: 'render', kilder: nye });
  };
  const start = () => {
    if (!document.body) return false;
    const obs = new MutationObserver(behandl);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => behandl(obs.takeRecords()));
    return true;
  };
  if (!start()) document.addEventListener('DOMContentLoaded', start);
})();`;

/**
 * Rå post fra browseren → logpost i samme format som Vitest-tappen.
 * Returnerer null, hvis posten er ubrugelig (ingen kilder, ukendt hændelse).
 */
export function tilPost(raa, rod, meta) {
  if (!raa || !(HAENDELSER.includes(raa.type) || raa.type === 'render') || !Array.isArray(raa.kilder)) return null;
  const kaede = raa.kilder.map((k) => noegleFraDebugSource(k, rod)).filter(Boolean);
  if (!kaede.length) return null;
  return { type: raa.type, kaede, test: meta.test || null, testfil: meta.testfil || null };
}

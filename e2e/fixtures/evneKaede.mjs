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
import { MAKS_KAEDE } from '../../scripts/lib/fladeDaekning.mjs';

export const HAENDELSER = ['click', 'input', 'change', 'submit'];

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
})();`;

/**
 * Rå post fra browseren → logpost i samme format som Vitest-tappen.
 * Returnerer null, hvis posten er ubrugelig (ingen kilder, ukendt hændelse).
 */
export function tilPost(raa, rod, meta) {
  if (!raa || !HAENDELSER.includes(raa.type) || !Array.isArray(raa.kilder)) return null;
  const kaede = raa.kilder.map((k) => noegleFraDebugSource(k, rod)).filter(Boolean);
  if (!kaede.length) return null;
  return { type: raa.type, kaede, test: meta.test || null, testfil: meta.testfil || null };
}

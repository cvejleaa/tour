import '@testing-library/jest-dom/vitest';
/* global process */

// --- Fladedækning: hvilke elementer rører testene ved? ----------------------
//
// Kun når EVNE_LOG peger på en mappe (build-test-report.mjs sætter den).
// Ellers er filen funktionelt den ene linje ovenfor.
//
// Lytteren sidder på document i CAPTURE-fasen og ser derfor ALT, der
// dispatches — fireEvent, userEvent og element.click() ens — og kan ikke
// omgås ved at importere biblioteket ad en anden vej. Den skriver kæden af
// kildesteder (fiber.return-kæden, se fladeDaekning.mjs) og hvilken test, der
// rørte elementet. Krediteringen sker først i fletningen; tappen dømmer ikke.
//
// ÉN FIL PR. WORKER. Vitest kører testfiler i tråde i samme proces, så
// process.pid alene er ikke unik — threadId skal med. To workere, der
// appender til samme fil, kunne flette halve linjer.
if (process.env.EVNE_LOG) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { threadId } = await import('node:worker_threads');
  const { expect, afterAll } = await import('vitest');
  const { kildeKaede } = await import('../../scripts/lib/fladeDaekning.mjs');
  const rod = process.cwd();
  const fil = path.join(process.env.EVNE_LOG, `${process.pid}-${threadId}.ndjson`);
  const linjer = [];
  for (const type of ['click', 'input', 'change', 'submit']) {
    document.addEventListener(type, (e) => {
      const el = e.target;
      if (!el || el.nodeType !== 1) return;
      const kaede = kildeKaede(el, rod);
      if (!kaede.length) return;
      const st = expect.getState();
      linjer.push(JSON.stringify({
        type, kaede,
        test: st.currentTestName || null,
        testfil: st.testPath ? path.relative(rod, st.testPath) : null,
      }));
    }, true);
  }
  afterAll(() => {
    if (!linjer.length) return;
    fs.mkdirSync(process.env.EVNE_LOG, { recursive: true });
    fs.appendFileSync(fil, `${linjer.join('\n')}\n`);
    linjer.length = 0;
  });
}

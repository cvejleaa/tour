// Playwright-fixture: samme `test`/`expect` som @playwright/test, men når
// EVNE_LOG peger på en mappe, logges hvilke elementer testen klikker på
// eller skriver i — i samme NDJSON-format som Vitest-tappen, én fil pr.
// worker. Uden EVNE_LOG er fixturen en ren gennemstilling.
//
// Bindingen og init-scriptet sættes på CONTEXT, ikke page: så overlever de
// navigationer og nye faner, og window.__evne-buffere, der nulstilles ved
// hver page load, er ikke nødvendige — hver hændelse sendes straks til Node.
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { INIT_SCRIPT, tilPost } from './evneKaede.mjs';

export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    const dir = process.env.EVNE_LOG;
    if (!dir) { await use(context); return; }
    const rod = process.cwd();
    const meta = { test: testInfo.title, testfil: path.relative(rod, testInfo.file) };
    const linjer = [];
    await context.exposeBinding('__evneLog', (_kilde, json) => {
      let raa;
      try { raa = JSON.parse(json); } catch { return; }
      const post = tilPost(raa, rod, meta);
      if (post) linjer.push(JSON.stringify(post));
    });
    await context.addInitScript(INIT_SCRIPT);
    await use(context);
    if (!linjer.length) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `e2e-${testInfo.workerIndex}.ndjson`), `${linjer.join('\n')}\n`);
  },
});

export { expect };

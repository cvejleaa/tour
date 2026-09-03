import { describe, it, expect } from 'vitest';
/* global document, window */
import { tilPost, INIT_SCRIPT, HAENDELSER } from './evneKaede.mjs';
import { MAKS_KAEDE } from '../../scripts/lib/fladeDaekning.mjs';

describe('tilPost — browserens rå tripler bliver til Vitest-tappens format', () => {
  const ROD = '/bygge/maskine/tour';
  it('konverterer absolutte build-stier til nøgler relative til roden, med Reacts 1-indekserede kolonne uændret', () => {
    const p = tilPost({
      type: 'click',
      kilder: [
        { fileName: `${ROD}/src/features/games/football/FootballTip.jsx`, lineNumber: 1050, columnNumber: 21 },
        { fileName: `${ROD}/src/features/games/football/FootballTip.jsx`, lineNumber: 1048, columnNumber: 19 },
      ],
    }, ROD, { test: 'et X-tip', testfil: 'e2e/platform/tip.spec.js' });
    expect(p).toEqual({
      type: 'click',
      kaede: ['src/features/games/football/FootballTip.jsx:1050:21', 'src/features/games/football/FootballTip.jsx:1048:19'],
      test: 'et X-tip',
      testfil: 'e2e/platform/tip.spec.js',
    });
  });

  it('kasserer poster uden kilder, med ukendt hændelse eller uden fileName', () => {
    expect(tilPost({ type: 'click', kilder: [] }, ROD, {})).toBeNull();
    expect(tilPost({ type: 'mousemove', kilder: [{ fileName: `${ROD}/src/A.jsx`, lineNumber: 1, columnNumber: 1 }] }, ROD, {})).toBeNull();
    expect(tilPost({ type: 'click', kilder: [{ lineNumber: 1, columnNumber: 1 }] }, ROD, {})).toBeNull();
    expect(tilPost(null, ROD, {})).toBeNull();
  });

  it('init-scriptet lytter på præcis de hændelser, fletningen kender, i capture-fasen, og kalder bindingen', () => {
    expect(HAENDELSER).toEqual(['click', 'input', 'change', 'submit']);
    expect(INIT_SCRIPT).toContain(JSON.stringify(HAENDELSER));
    expect(INIT_SCRIPT).toContain('}, true);');
    expect(INIT_SCRIPT).toContain('window.__evneLog(');
    expect(INIT_SCRIPT).toContain('__reactFiber$');
    expect(INIT_SCRIPT).toContain('_debugSource');
    // Samme kædedybde som Node-udgaven (kildeKaede) — håndkopien må ikke drive.
    expect(INIT_SCRIPT).toContain(`i < ${MAKS_KAEDE};`);
    // Skal kunne parses som selvstændigt script.
    expect(() => new Function(INIT_SCRIPT)).not.toThrow();
  });

  it('capture-fasen fanger klikket, selv når target-fasen stopper videre bobling (Test Managers adfærdstest)', () => {
    // Streng-assertionen ovenfor er en tekstmatch. Denne kører scriptet i
    // jsdom: et element med en fake fiber, en stopPropagation i target-fasen
    // — kun en capture-lytter på document ser klikket alligevel.
    document.body.innerHTML = '<button id="btn"></button>';
    const btn = document.getElementById('btn');
    btn.__reactFiber$test = { _debugSource: { fileName: '/rod/src/A.jsx', lineNumber: 5, columnNumber: 3 }, return: null };
    const kald = [];
    window.__evneLog = (json) => kald.push(JSON.parse(json));
    btn.addEventListener('click', (e) => e.stopPropagation());
    new Function(INIT_SCRIPT)();
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(kald).toEqual([{ type: 'click', kilder: [{ fileName: '/rod/src/A.jsx', lineNumber: 5, columnNumber: 3 }] }]);
    delete window.__evneLog;
  });
});

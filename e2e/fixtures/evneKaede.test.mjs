import { describe, it, expect } from 'vitest';
import { tilPost, INIT_SCRIPT, HAENDELSER } from './evneKaede.mjs';

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
    // Skal kunne parses som selvstændigt script.
    expect(() => new Function(INIT_SCRIPT)).not.toThrow();
  });
});

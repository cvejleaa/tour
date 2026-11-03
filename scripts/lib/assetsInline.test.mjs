// Landeflagene må aldrig inlines i hovedbundtet — prædikatet og at
// vite.config.js faktisk bruger det. Buildet selv måles af
// scripts/maal-flag.mjs --dist (32 svg-filer, 0 data:image/svg+xml).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assetsInlineLimit } from './assetsInline.mjs';

describe('assetsInlineLimit', () => {
  it('siger NEJ til flag-icons — også med Windows-skråstreger', () => {
    expect(assetsInlineLimit('/home/x/node_modules/flag-icons/flags/4x3/dk.svg')).toBe(false);
    expect(assetsInlineLimit('C:\\repo\\node_modules\\flag-icons\\flags\\4x3\\dk.svg')).toBe(false);
  });

  // undefined = Vites egen regel (4096 B). `false` her ville stoppe al
  // inlining i appen; `true` ville inline alt.
  it('lader alt andet følge Vites standard', () => {
    expect(assetsInlineLimit('/home/x/src/assets/logo.svg')).toBeUndefined();
    expect(assetsInlineLimit('/home/x/node_modules/leaflet/dist/images/marker-icon.png')).toBeUndefined();
    // Navnet alene er ikke nok — det skal være pakken.
    expect(assetsInlineLimit('/home/x/src/flag-icons/dk.svg')).toBeUndefined();
  });

  // KILDEN, IKKE KONFIGURATIONSOBJEKTET. vite.config.js importerer vite selv,
  // og vite (esbuild) kan ikke indlæses i testmiljøet (jsdom og fladevagtens
  // tap). Kommentarer fjernes først, så en udkommenteret linje ikke tæller.
  // Det egentlige bevis er buildet: `node scripts/maal-flag.mjs --dist dist`.
  it('er det, vite.config.js bruger — for begge builds', () => {
    const kilde = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(kilde).toContain("import { assetsInlineLimit } from './scripts/lib/assetsInline.mjs';");
    expect(kilde).toMatch(/build:\s*\{\s*assetsInlineLimit\s*\}/);
    // Ét sted, ingen gren pr. app: platform og Tour bygges med samme objekt.
    expect(kilde.match(/assetsInlineLimit/g)).toHaveLength(2);
  });
});

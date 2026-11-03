// @vitest-environment node
// (vite.config.js importerer vite/esbuild, som ikke tåler jsdom-miljøet.)
// Landeflagene må aldrig inlines i hovedbundtet — prædikatet og at
// vite.config.js faktisk bruger det. Buildet selv måles af
// scripts/maal-flag.mjs --dist (32 svg-filer, 0 data:image/svg+xml).
import { describe, it, expect } from 'vitest';
import { assetsInlineLimit } from './assetsInline.mjs';
import viteConfig from '../../vite.config.js';

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

  it('er det, vite.config.js bruger — for begge builds', () => {
    for (const mode of ['production', 'development']) {
      const cfg = viteConfig({ mode, command: 'build' });
      expect(cfg.build.assetsInlineLimit, mode).toBe(assetsInlineLimit);
    }
  });
});

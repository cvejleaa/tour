import { describe, it, expect, vi, afterEach } from 'vitest';

// PLATFORM_MODE/HOME_PATH læses fra import.meta.env ved modul-load, så vi
// stubber env og re-importerer modulet friskt i hver test.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('platform-tilstand', () => {
  it('standard (flag ikke sat): enkelt-spil, forsiden er /', async () => {
    vi.resetModules();
    const { PLATFORM_MODE, HOME_PATH } = await import('./platform.js');
    expect(PLATFORM_MODE).toBe(false);
    expect(HOME_PATH).toBe('/');
  });

  it('VITE_PLATFORM_MODE=true: platform, forsiden er spiloversigten /spil', async () => {
    vi.stubEnv('VITE_PLATFORM_MODE', 'true');
    vi.resetModules();
    const { PLATFORM_MODE, HOME_PATH } = await import('./platform.js');
    expect(PLATFORM_MODE).toBe(true);
    expect(HOME_PATH).toBe('/spil');
  });

  it('andre værdier end "true" tæller som slået fra', async () => {
    vi.stubEnv('VITE_PLATFORM_MODE', '1');
    vi.resetModules();
    const { PLATFORM_MODE, HOME_PATH } = await import('./platform.js');
    expect(PLATFORM_MODE).toBe(false);
    expect(HOME_PATH).toBe('/');
  });
});

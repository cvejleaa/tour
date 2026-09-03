// Vagten om emulator-værten skal kunne gøres rød uden at starte en emulator.
import { describe, it, expect } from 'vitest';
import { erLokalVaert } from './seed-e2e.mjs';

describe('seed-e2e: kun lokale emulator-værter', () => {
  it.each(['localhost:8080', '127.0.0.1:9099', '[::1]:8080'])('tillader %s', (h) => {
    expect(erLokalVaert(h)).toBe(true);
  });
  it.each(['example.invalid:1', 'firestore.googleapis.com:443', '10.0.0.5:8080', '', undefined])('afviser %s', (h) => {
    expect(erLokalVaert(h)).toBe(false);
  });
});

describe('seed-e2e: vagterne sidder FØR første netværkskald', () => {
  // Rejektionen skal komme fra vagten, ikke fra en timeout mod en vært, der
  // ikke svarer — ellers ville en fjernet vagt først vise sig som 30 s ventetid.
  const gem = { ...process.env };
  const gendan = () => { for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) { if (gem[k] === undefined) delete process.env[k]; else process.env[k] = gem[k]; } };

  it('afviser en fremmed Firestore-vært med det samme', async () => {
    const { default: seed } = await import('./seed-e2e.mjs');
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.FIRESTORE_EMULATOR_HOST = 'example.invalid:1';
    try {
      await expect(seed()).rejects.toThrow(/FIRESTORE_EMULATOR_HOST=example\.invalid:1 er ikke en lokal vært/);
    } finally { gendan(); }
  });

  it('afviser at køre med GOOGLE_APPLICATION_CREDENTIALS sat', async () => {
    const { default: seed } = await import('./seed-e2e.mjs');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/ingen/saadan/fil.json';
    try {
      await expect(seed()).rejects.toThrow(/GOOGLE_APPLICATION_CREDENTIALS/);
    } finally { gendan(); }
  });
});

// Dummy-adgangskoder til emulator-konti — KUN til E2E (seed og login).
//
// Ligger i sin egen fil, adskilt fra konstanter.mjs, fordi konstanterne nu
// også importeres af Vitest-tests og src/test/scenarie/. Alle importører er
// testfiler i dag, men lå adgangskoderne i samme fil, ville én import fra en
// fil, app-koden kan nå, lægge dem i bundtet (Security-fund). Denne fil må
// KUN importeres fra e2e/. adgangskoder.test.mjs vogter det.
export const ADGANGSKODER = {
  'e2e-spiller': 'e2e-hemmelig-1',
  'e2e-ejer': 'e2e-hemmelig-2',
  'e2e-modspiller': 'e2e-hemmelig-3',
  'e2e-fremmed': 'e2e-hemmelig-4',
  'e2e-forladt': 'e2e-hemmelig-5',
};

/** Adgangskoden for en konto — kaster, hvis kontoen ikke findes (et seed må ikke oprette en konto uden). */
export function adgangskode(uid) {
  const pw = ADGANGSKODER[uid];
  if (!pw) throw new Error(`adgangskoder.mjs: ingen adgangskode for ${uid}`);
  return pw;
}

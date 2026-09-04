// ---------------------------------------------------------------------------
// e2e/fixtures/konstanter.mjs — det, seed og tests skal være enige om.
//
// Ligger i sin egen fil, så en .spec.js kan importere navne og id'er UDEN at
// trække firebase-admin ind i Playwright-workeren (det gør seed-e2e.mjs).
// Importeres også af Vitest-tests og src/test/scenarie/ — derfor INGEN
// adgangskoder her; de ligger i adgangskoder.mjs, som kun e2e/ må importere.
// ---------------------------------------------------------------------------

/** Emulator-projektet. Skal matche `--project` i `npm run test:e2e:emu`. */
export const PROJEKT = 'demo-vm2026';

export const SPILLER = {
  uid: 'e2e-spiller',
  email: 'spiller@e2e.test',
  displayName: 'E2E Spiller',
};

export const EJER = {
  uid: 'e2e-ejer',
  email: 'ejer@e2e.test',
  displayName: 'E2E Ejer',
};

/** En medspiller i samme liga som SPILLER — den eneste, stillingen må vise. */
export const MODSPILLER = {
  uid: 'e2e-modspiller',
  email: 'modspiller@e2e.test',
  displayName: 'E2E Modspiller',
};

/** Deltager i spillet, men i en ANDEN liga — stillingens offer: må ikke ses. */
export const FREMMED = {
  uid: 'e2e-fremmed',
  email: 'fremmed@e2e.test',
  displayName: 'E2E Fremmed',
};

/** Har forladt spillet (players-doc med forladt: true og point). Kan vende tilbage. */
export const FORLADT = {
  uid: 'e2e-forladt',
  email: 'forladt@e2e.test',
  displayName: 'E2E Forladt',
};

export const SPIL_ID = 'e2e-liga';
export const SPIL_NAVN = 'E2E-ligaen';

/** Ligaen, SPILLER og MODSPILLER deler. Stillingen viser kun liga-kammerater. */
export const LIGA_ID = 'e2e-liga-1';
export const LIGA_NAVN = 'E2E-kammeraterne';
/** Den fremmedes liga. Spilleren er ikke med — så hendes point er usynlige. */
export const FREMMED_LIGA_ID = 'e2e-liga-2';

/** Point, seedet direkte på players-dokumenterne (serverens felter). Den
 *  fremmede har FLEST: stod hun i stillingen, ville hun stå øverst. */
export const POINT = { [SPILLER.uid]: 4.5, [MODSPILLER.uid]: 7, [FREMMED.uid]: 9 };

/**
 * Fire opdigtede hold. Elo-tallene giver odds via buildMatches. Deles af
 * seedet (emulatoren) og Vitest-scenariet (src/test/scenarie/superliga.js),
 * så de to taler om samme hold og samme kamp-id'er.
 */
export const HOLD = [
  { name: 'Alfa BK', short: 'ALF', elo: 1550 },
  { name: 'Beta IF', short: 'BET', elo: 1500 },
  { name: 'Gamma FC', short: 'GAM', elo: 1480 },
  { name: 'Delta BK', short: 'DEL', elo: 1420 },
];

/** Runden med kickoff i FREMTIDEN (kan tippes) og runden i FORTIDEN (låst). */
export const AABEN_RUNDE = 20;
export const LAAST_RUNDE = 19;
/** Runden med en UDSAT kamp: to spillede for to uger siden og én, der spilles i
 *  denne uge — den lånte kamp, der vises på runde 20 og låser før dens egne. */
export const UDSAT_RUNDE = 18;

/** Hvor login-tilstanden gemmes mellem setup og tests. */
export const SPILLER_STATE = 'e2e/.auth/spiller.json';
export const EJER_STATE = 'e2e/.auth/ejer.json';
export const FORLADT_STATE = 'e2e/.auth/forladt.json';

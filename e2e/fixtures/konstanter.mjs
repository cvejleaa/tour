// ---------------------------------------------------------------------------
// e2e/fixtures/konstanter.mjs — det, seed og tests skal være enige om.
//
// Ligger i sin egen fil, så en .spec.js kan importere navne og id'er UDEN at
// trække firebase-admin ind i Playwright-workeren (det gør seed-e2e.mjs).
// ---------------------------------------------------------------------------

/** Emulator-projektet. Skal matche `--project` i `npm run test:e2e:emu`. */
export const PROJEKT = 'demo-vm2026';

export const SPILLER = {
  uid: 'e2e-spiller',
  email: 'spiller@e2e.test',
  password: 'e2e-hemmelig-1',
  displayName: 'E2E Spiller',
};

export const EJER = {
  uid: 'e2e-ejer',
  email: 'ejer@e2e.test',
  password: 'e2e-hemmelig-2',
  displayName: 'E2E Ejer',
};

/** En medspiller i samme liga som SPILLER — den eneste, stillingen må vise. */
export const MODSPILLER = {
  uid: 'e2e-modspiller',
  email: 'modspiller@e2e.test',
  password: 'e2e-hemmelig-3',
  displayName: 'E2E Modspiller',
};

export const SPIL_ID = 'e2e-liga';
export const SPIL_NAVN = 'E2E-ligaen';

/** Ligaen, SPILLER og MODSPILLER deler. Stillingen viser kun liga-kammerater. */
export const LIGA_ID = 'e2e-liga-1';
export const LIGA_NAVN = 'E2E-kammeraterne';

/** Point, seedet direkte på players-dokumenterne (serverens felter). */
export const POINT = { [SPILLER.uid]: 4.5, [MODSPILLER.uid]: 7 };

/** Runden med kickoff i FREMTIDEN (kan tippes) og runden i FORTIDEN (låst). */
export const AABEN_RUNDE = 20;
export const LAAST_RUNDE = 19;

/** Hvor login-tilstanden gemmes mellem setup og tests. */
export const SPILLER_STATE = 'e2e/.auth/spiller.json';
export const EJER_STATE = 'e2e/.auth/ejer.json';

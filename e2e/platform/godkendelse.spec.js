// Hele adgangskæden mod ægte regler: en ny bruger opretter sig, lander på
// /afventer, ejeren godkender under Admin → Brugere — og brugeren kommer ind
// UDEN at genindlæse, fordi AuthContext lytter på users/{uid}.
//
// Det er den kæde, husets dyreste fejl ramte ("en lille ændring spærrede alle
// migrerede brugere ude"). Ingen anden test kører den ende til ende.
import { test, expect } from '../fixtures/evne.mjs';
import { EJER_STATE } from '../fixtures/konstanter.mjs';

// Denne test starter UDEN gemt login — brugeren findes ikke endnu.
test.use({ storageState: { cookies: [], origins: [] } });

test('ny bruger venter på godkendelse, og ejerens Godkend lukker hende ind', async ({ page, browser }) => {
  // Unik pr. kørsel: Auth-emulatoren nulstilles kun af seedet, og en
  // gentagelse med samme e-mail ville fejle på "findes allerede".
  const navn = `Ny Spiller ${Date.now()}`;
  const email = `ny-${Date.now()}@e2e.test`;

  await page.goto('/login');
  await page.getByRole('button', { name: 'Opret bruger' }).first().click();
  await page.locator('#signup-name').fill(navn);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-pw').fill('ny-hemmelig-1');
  await page.getByRole('button', { name: 'Opret bruger' }).last().click();
  await expect(page).toHaveURL(/\/afventer$/);
  await expect(page.getByRole('heading', { name: 'Afventer godkendelse' })).toBeVisible();

  // Ejeren i sin egen context. Godkend spørger "Er du sikker…" via
  // window.confirm — uden accept ville klikket være et nej.
  const ejerCtx = await browser.newContext({ storageState: EJER_STATE });
  const admin = await ejerCtx.newPage();
  admin.on('dialog', (d) => d.accept());
  await admin.goto('/admin');
  await admin.getByRole('tab', { name: 'Brugere' }).click();
  const raekke = admin.getByRole('listitem').filter({ hasText: navn });
  await expect(raekke, 'den nye bruger står i brugerlisten').toBeVisible();
  await raekke.getByRole('button', { name: 'Godkend' }).click();
  // Rækken skifter tilstand: Godkend-knappen forsvinder, når status er approved.
  await expect(raekke.getByRole('button', { name: 'Godkend' })).toHaveCount(0);
  await ejerCtx.close();

  // Brugerens fane har IKKE været genindlæst: statusskiftet skal komme via
  // onSnapshot, og PendingPage sender videre til forsiden = /spil.
  await expect(page).toHaveURL(/\/spil$/);
  await expect(page.getByRole('heading', { name: 'Mine spil' })).toBeVisible();
});

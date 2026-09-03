// Seeder emulatorerne og logger den godkendte spiller ind gennem FLADEN (ikke
// via en token-bagdør), og gemmer browser-tilstanden, så de øvrige
// platform-tests starter indlogget. Seedet ligger her og ikke i globalSetup:
// så kører det kun, når platform-projektet kører — aldrig for tour-smoke.
//
// `indexedDB: true` er ikke pynt: Firebase Auth gemmer sessionen i IndexedDB,
// ikke i localStorage. Uden flaget er den gemte tilstand tom, og hver test
// lander på /login igen.
import { test as setup, expect } from '@playwright/test';
import { SPILLER, EJER, SPILLER_STATE, EJER_STATE } from '../fixtures/konstanter.mjs';
import seed from '../fixtures/seed-e2e.mjs';

/** Log ind gennem fladen og gem tilstanden. Venter på noget, der kræver BÅDE
 *  auth og Firestore (users/{uid}.status): /spil nås kun gennem
 *  ProtectedRoute, og overskriften kræver games-læsning. */
async function logIndOgGem(page, bruger, sti) {
  await page.goto('/login');
  await page.locator('#login-email').fill(bruger.email);
  await page.locator('#login-pw').fill(bruger.password);
  // "Log ind" matcher både fanen og submit-knappen — knappen er den sidste.
  await page.getByRole('button', { name: 'Log ind' }).last().click();
  await expect(page).toHaveURL(/\/spil$/);
  await expect(page.getByRole('heading', { name: 'Mine spil' })).toBeVisible();
  await page.context().storageState({ path: sti, indexedDB: true });
}

setup('seed emulatorerne og log ind som spiller og som ejer', async ({ page, browser }) => {
  await seed();
  await logIndOgGem(page, SPILLER, SPILLER_STATE);
  // Ejeren i sin egen context — to sessioner kan ikke dele én IndexedDB.
  const ejer = await browser.newContext();
  await logIndOgGem(await ejer.newPage(), EJER, EJER_STATE);
  await ejer.close();
});

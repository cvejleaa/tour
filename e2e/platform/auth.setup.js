// Seeder emulatorerne og logger den godkendte spiller ind gennem FLADEN (ikke
// via en token-bagdør), og gemmer browser-tilstanden, så de øvrige
// platform-tests starter indlogget. Seedet ligger her og ikke i globalSetup:
// så kører det kun, når platform-projektet kører — aldrig for tour-smoke.
//
// `indexedDB: true` er ikke pynt: Firebase Auth gemmer sessionen i IndexedDB,
// ikke i localStorage. Uden flaget er den gemte tilstand tom, og hver test
// lander på /login igen.
import { test as setup, expect } from '@playwright/test';
import { SPILLER, SPILLER_STATE } from '../fixtures/konstanter.mjs';
import seed from '../fixtures/seed-e2e.mjs';

setup('seed emulatorerne og log ind som godkendt spiller', async ({ page }) => {
  await seed();
  await page.goto('/login');
  await page.locator('#login-email').fill(SPILLER.email);
  await page.locator('#login-pw').fill(SPILLER.password);
  // "Log ind" matcher både fanen og submit-knappen — knappen er den sidste.
  await page.getByRole('button', { name: 'Log ind' }).last().click();
  // Vent på noget, der kræver BÅDE auth og Firestore (users/{uid}.status):
  // /spil nås kun gennem ProtectedRoute, og overskriften kræver games-læsning.
  await expect(page).toHaveURL(/\/spil$/);
  await expect(page.getByRole('heading', { name: 'Mine spil' })).toBeVisible();
  await page.context().storageState({ path: SPILLER_STATE, indexedDB: true });
});

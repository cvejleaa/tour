// Den mindste autentificerede kæde: gemt login → /spil → åbn spillet → fanerne.
// Kan kun blive grøn, hvis ProtectedRoute (status approved), games-læsningen
// (allow read: if isApproved()) og players/{uid}-medlemskabet alle holder.
import { test, expect } from '@playwright/test';
import { SPIL_ID, SPIL_NAVN } from '../fixtures/konstanter.mjs';

test('godkendt spiller lander på spiloversigten og kan åbne sit spil', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/spil$/);
  // Synligheden først: uden players/{uid} står spillet ikke under "Mine spil",
  // og et direkte .click() ville først fejle på testens 30 s-timeout.
  const link = page.getByRole('link', { name: `Åbn spil: ${SPIL_NAVN}` });
  await expect(link, 'spillet står under Mine spil').toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/spil/${SPIL_ID}`));
  await expect(page.getByRole('tab', { name: 'Tip', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Mine tips' })).toBeVisible();
  // Medlem: Deltag-kortet må IKKE vises (GamePage viser det, når me == null).
  await expect(page.getByRole('heading', { name: `Deltag i ${SPIL_NAVN}` })).toHaveCount(0);
});

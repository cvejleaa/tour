// Låsen efter kickoff når helt ud i knappen: en kamp med passeret kickoff kan
// ikke tippes fra fladen. footballRounds.test.js dækker isLocked som funktion;
// ingen anden test dækker, at den NÅR knappen.
//
// Fraværs-assertions fastfryser fejl, så testen kræver to ting: knapperne er
// disabled, OG et klik-event ændrer intet. `pointer-events: none` i CSS ville
// ellers gøre en ren toBeDisabled-test grøn, uden at `locked` virkede.
import { test, expect } from '@playwright/test';
import { SPIL_ID, LAAST_RUNDE } from '../fixtures/konstanter.mjs';

test('kampe med passeret kickoff kan ikke tippes', async ({ page }) => {
  await page.goto(`/spil/${SPIL_ID}?runde=${LAAST_RUNDE}`);
  await expect(page.getByTestId('round-nav-count')).toHaveText(new RegExp(`Runde ${LAAST_RUNDE} af`));

  const knapper = page.locator('.pick');
  await expect(knapper).toHaveCount(6); // to kampe × 1/X/2
  for (let i = 0; i < 6; i++) await expect(knapper.nth(i)).toBeDisabled();

  await knapper.first().dispatchEvent('click');
  await expect(page.locator('.pick--selected')).toHaveCount(0);
  // Den anden halvdel af samme betingelse: efter kickoff vises ligaens tips
  // (her: opfordringen til at gå med i en liga, fordi spilleren ingen har).
  await expect(page.getByRole('link', { name: 'Bliv med i en liga' }).first()).toBeVisible();
});

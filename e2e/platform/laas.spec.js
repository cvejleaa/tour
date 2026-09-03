// Låsen efter kickoff når helt ud i knappen: en kamp med passeret kickoff kan
// ikke tippes fra fladen. footballRounds.test.js dækker isLocked som funktion;
// ingen anden test dækker, at den NÅR knappen.
//
// Fraværs-assertions fastfryser fejl. Det, testen KAN bevise fra fladen, er
// render-betingelsen: alle knapper er disabled, og ligaens tips vises i
// stedet (den anden halvdel af samme `locked`). pick()'s egen isLocked-vagt
// (FootballTip.jsx) kan IKKE nås herfra: React sluger klik på en knap, hvis
// disabled-PROP er sat — også når attributten fjernes i DOM'en (Test Manager
// målte det med en tæller i pick(), og mutationen "vagt fjernet" overlevede
// begge varianter). Den vagt er tredje lag bag knappen og firestore.rules;
// reglen "tip efter kickoff afvises" bæres af functions/rules.test.js.
import { test, expect } from '@playwright/test';
import { SPIL_ID, LAAST_RUNDE } from '../fixtures/konstanter.mjs';

test('kampe med passeret kickoff kan ikke tippes', async ({ page }) => {
  await page.goto(`/spil/${SPIL_ID}?runde=${LAAST_RUNDE}`);
  await expect(page.getByTestId('round-nav-count')).toHaveText(new RegExp(`Runde ${LAAST_RUNDE} af`));

  const knapper = page.locator('.pick');
  await expect(knapper).toHaveCount(6); // to kampe × 1/X/2
  for (let i = 0; i < 6; i++) await expect(knapper.nth(i)).toBeDisabled();

  // Den anden halvdel af samme betingelse: efter kickoff vises ligaens tips
  // (her: opfordringen til at gå med i en liga, fordi spilleren ingen har).
  await expect(page.getByRole('link', { name: 'Bliv med i en liga' }).first()).toBeVisible();
});

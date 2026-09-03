// Tip afgives fra fladen og lander som dokument, REGLERNE accepterer — og
// vises i Mine tips med præcis det bogstav, der blev klikket.
// betActions.test.js mocker Firestore; dette er den eneste test, der skriver
// et tip gennem firestore.rules.
import { test, expect } from '@playwright/test';
import { SPIL_ID, AABEN_RUNDE } from '../fixtures/konstanter.mjs';

test('et X-tip på en åben kamp vises i Mine tips', async ({ page }) => {
  await page.goto(`/spil/${SPIL_ID}`);
  // Den aktive runde er den med det tidligste fremtidige kickoff.
  await expect(page.getByTestId('round-nav-count')).toHaveText(new RegExp(`Runde ${AABEN_RUNDE} af`));

  // Ligaens tips hører til LÅSTE kampe. På den åbne runde må panelet ikke
  // findes — laas.spec ser kun runde 19, hvor alt er låst, så uden denne
  // assertion kunne gaten `{locked && <LeagueBets/>}` fjernes med grøn suite.
  await expect(page.getByRole('button', { name: 'Se ligaens tips' })).toHaveCount(0);

  const kort = page.locator('.pick-grid').first();
  const x = kort.locator('.pick').filter({ has: page.locator('.pick__label', { hasText: /^X$/ }) });
  await expect(x).toBeEnabled();
  await x.click();
  // En regel-afvisning kaster ikke — den vises som rød badge, og knappen
  // bliver aldrig valgt. Vent på det første af de to udfald, og læs så
  // badgen FØR klassen: ellers fejler testen på "manglende klasse" uden at
  // sige hvorfor (Test Manager tvang en afvisning og så præcis det).
  await expect(page.locator('.pick--selected, .badge--red').first()).toBeVisible();
  expect(await page.locator('.badge--red').allTextContents(), 'regel-afvisning vist som rød badge').toEqual([]);
  await expect(x).toHaveClass(/pick--selected/);

  await page.getByRole('tab', { name: 'Mine tips' }).click();
  const runde = page.locator('.card', { hasText: `Runde ${AABEN_RUNDE}` }).first();
  await expect(runde.locator('.mytips__meta')).toContainText('1/2 tippet · 0 ramt');
  // Indholdet, ikke kun synligheden: bogstavet skal være X, ikke bare "noget".
  await expect(runde.locator('.mytips__pick').filter({ hasText: /^X/ })).toHaveCount(1);
  await expect(runde.locator('.mytips__pick').filter({ hasText: /^[12]/ })).toHaveCount(0);
});

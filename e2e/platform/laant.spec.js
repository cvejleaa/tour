// Ejerens fejl fra 3/9 (#213), end-to-end: en kamp fra runde 18, udsat til
// denne uge, vises på runde 20 — øverst, fordi den låser først — og «Næste
// kamp låser om» regner med den. Tælleren og kuponen regner derimod kun
// rundens egne kampe. FootballTip.scenarie.test.jsx beviser det i jsdom med
// frossen tid; her er det den byggede app mod emulatoren med ægte tid.
import { test, expect } from '../fixtures/evne.mjs';
import { SPIL_ID, AABEN_RUNDE, UDSAT_RUNDE } from '../fixtures/konstanter.mjs';

test('den lånte kamp står øverst på runde 20, bærer sin runde, og tælleren peger på den', async ({ page }) => {
  await page.goto(`/spil/${SPIL_ID}`);
  await expect(page.getByTestId('round-nav-count')).toHaveText(new RegExp(`Runde ${AABEN_RUNDE} af`));

  const kort = page.locator('.match-card');
  await expect(kort).toHaveCount(3); // to egne + den lånte
  await expect(kort.first()).toHaveClass(/match-card--udenfor/);
  await expect(kort.nth(1)).not.toHaveClass(/match-card--udenfor/);
  await expect(kort.nth(2)).not.toHaveClass(/match-card--udenfor/);

  // Mærkaten siger, hvor pointene tæller — og IKKE «udsat».
  const maerkat = page.getByTestId('fra-runde');
  await expect(maerkat).toContainText(`Runde ${UDSAT_RUNDE}`);
  await expect(maerkat).toContainText('point tæller dér');
  await expect(maerkat).not.toContainText(/udsat/i);

  // Den lånte låser om 1½ time (seedet), rundens egne først om 3 og 27 timer:
  // tælleren afrunder (1½ t → «2 t», og efter et par minutter «1 t»), så det,
  // der skelner, er «ikke 3 t» — rundens egen første kamp — og at den LYSER
  // (under 2 t), hvilket rundens egne aldrig ville give.
  const taeller = page.getByText(/Næste kamp låser om/);
  await expect(taeller).toHaveText(/Næste kamp låser om [12] t/);
  await expect(taeller).not.toHaveText(/om 3 t/);
  await expect(page.locator('.round-head__deadline--soon')).toHaveCount(1);

  // Kuponen tæller kun rundens egne: 0/2, ikke 0/3.
  await expect(page.getByText('0/2 tippet')).toBeVisible();
  await expect(page.getByText('0/3 tippet')).toHaveCount(0);

  // Og den lånte kan tippes — den er ulåst.
  const laantX = kort.first().locator('.pick').filter({ has: page.locator('.pick__label', { hasText: /^X$/ }) });
  await expect(laantX).toBeEnabled();
});

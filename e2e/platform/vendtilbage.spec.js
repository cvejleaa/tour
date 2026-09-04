// En forladt spiller vender tilbage — for alvor, gennem firestore.rules:
// kortet står under Åbne spil med «Vend tilbage» (ikke «Deltag», ikke
// «Forlad»), klikket fjerner forladt-flaget på players-dokumentet, og spillet
// flytter til Mine spil med sine point i behold. Ingen callable: joinGame's
// update-gren er en klient-skrivning, reglerne tillader (rules.test.js
// «KAN selv fjerne sit forladt-flag»). Egen storageState: den forladte.
import { test, expect } from '../fixtures/evne.mjs';
import { SPIL_ID, SPIL_NAVN, FORLADT_STATE, AABEN_RUNDE } from '../fixtures/konstanter.mjs';

test.use({ storageState: FORLADT_STATE });

test('«Vend tilbage» gør den forladte til medlem igen — gennem reglerne', async ({ page }) => {
  await page.goto('/spil');
  const tilbage = page.getByRole('button', { name: `Vend tilbage til ${SPIL_NAVN}` });
  await expect(tilbage).toBeVisible();
  await expect(tilbage).toHaveText('Vend tilbage');
  await expect(page.getByRole('button', { name: `Deltag i ${SPIL_NAVN}` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Forlad ${SPIL_NAVN}` })).toHaveCount(0);

  await tilbage.click();
  // handleJoin (GamesPage.jsx) navigerer til spilsiden, så snart skrivningen
  // er igennem — det er den designede vej, og den asserteres FØRST. Læste
  // testen Mine spil-kortet før navigationen, hvilede den på, at onSnapshot
  // nåede DOM'en før await'et (QC-fund) — ikke på noget, koden lover.
  await expect(page).toHaveURL(new RegExp(`/spil/${SPIL_ID}$`));
  // Spilsiden viser fanerne, ikke Deltag-kortet: tip-fladen åbner på runde 20.
  await expect(page.getByTestId('round-nav-count')).toHaveText(new RegExp(`Runde ${AABEN_RUNDE} af`));
  await expect(page.getByRole('button', { name: /Vend tilbage/ })).toHaveCount(0);
  expect(await page.locator('[role="alert"]').allTextContents(), 'ingen fejl ved tilbagevenden').toEqual([]);

  // Den forladte har ingen liga længere (forladSpil tog hende ud): stillingen
  // siger det pænt i stedet for at stå tom — den tilstand skaber kun dette seed.
  await page.getByRole('tab', { name: /Stilling/ }).click();
  await expect(page.getByText('Du er ikke med i en liga endnu.')).toBeVisible();

  // Og tilbage på oversigten står spillet under Mine spil med Forlad — Vend tilbage er væk.
  await page.goto('/spil');
  await expect(page.getByRole('button', { name: `Forlad ${SPIL_NAVN}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Vend tilbage til ${SPIL_NAVN}` })).toHaveCount(0);
});

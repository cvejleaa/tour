// Forlad med point, som ejeren så det 3/9: knappen findes for et åbent spil,
// der spørges TO gange, og anden dialog nævner tallet — og det, der sendes,
// er callable'en forladSpil med spillets id. Functions-emulatoren kører ikke
// i E2E; kaldet opsnappes i browseren og besvares som serveren ville. Det,
// serveren gør med kaldet (sletter tips, arkiverer), bevises i
// functions-platform/forladSpil.test.js. Det, DENNE test beviser, er vejen
// fra knap til kald: den, der var brudt for spillere med point.
import { test, expect } from '../fixtures/evne.mjs';
import { SPIL_ID, SPIL_NAVN, SPILLER, POINT } from '../fixtures/konstanter.mjs';

test('Forlad spørger to gange med mine point og kalder forladSpil med spillets id', async ({ page }) => {
  const dialoger = [];
  page.on('dialog', async (d) => { dialoger.push(d.message()); await d.accept(); });

  let kald = null;
  await page.route('**/forladSpil', async (route) => {
    kald = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, slettedeTips: 0, ligaer: 1 } }) });
  });

  await page.goto('/spil');
  const knap = page.getByRole('button', { name: `Forlad ${SPIL_NAVN}` });
  await expect(knap).toBeVisible();
  await knap.click();

  await expect.poll(() => kald, { message: 'forladSpil blev kaldt' }).not.toBeNull();
  expect(kald).toEqual({ data: { gameId: SPIL_ID } });

  expect(dialoger).toHaveLength(2);
  expect(dialoger[0]).toContain(`Forlad "${SPIL_NAVN}"?`);
  expect(dialoger[0]).toContain('tips på kommende kampe slettes');
  // Anden dialog: TALLET, med dansk komma, og at stillingen kommer igen ved tilbagevenden.
  const point = String(POINT[SPILLER.uid]).replace('.', ',');
  expect(dialoger[1]).toContain(`Du står med ${point} point i ${SPIL_NAVN}.`);
  expect(dialoger[1]).toContain('får du din stilling igen');
  expect(dialoger[1]).not.toContain(String(POINT[SPILLER.uid])); // aldrig «4.5» med punktum

  // Ingen fejl vist — kaldet lykkedes, som serveren ville have svaret.
  expect(await page.locator('[role="alert"]').allTextContents()).toEqual([]);
});

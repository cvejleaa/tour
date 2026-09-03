// Stillingen mod ægte regler og ægte query: spilleren ser præcis dem, hun
// deler liga med, med de point, serveren har skrevet.
//
// Det er "regler er ikke filtre"-fælden: useGameStandings spørger med
// array-contains-any på leagueIds, og reglen tillader kun læsning af
// players-dokumenter med en delt liga. Går de to fra hinanden, ser brugeren
// en TOM stilling uden fejlbesked. Derfor asserteres antal, navne, tal — og
// at intet blev logget som fejl i konsollen (snapshot-fejl ender dér).
//
// Fixturen har et OFFER: den fremmede deltager i spillet med flest point, men
// i en anden liga. Fjernes filteret i forespørgslen, rammer den hendes
// dokument, reglen afviser hele forespørgslen, og tabellen bliver tom med en
// fejl — uden hende var testen grøn med og uden filter (Security's fund).
import { test, expect } from '../fixtures/evne.mjs';
import { SPIL_ID, SPILLER, MODSPILLER, FREMMED, POINT } from '../fixtures/konstanter.mjs';
import { fmtPoints } from '../../src/lib/daNum.js';

test('stillingen viser liga-kammeraterne med serverens point', async ({ page }) => {
  const konsolFejl = [];
  page.on('console', (msg) => { if (msg.type() === 'error') konsolFejl.push(msg.text()); });

  await page.goto(`/spil/${SPIL_ID}?fane=stilling`);
  const raekker = page.locator('table tbody tr');
  await expect(raekker).toHaveCount(2);
  // Modspilleren fører (7 > 4,5) — rækkefølge, navne og tal fra fixturen,
  // formateret med samme funktion som fladen (dansk komma).
  await expect(raekker.nth(0)).toContainText(MODSPILLER.displayName);
  await expect(raekker.nth(0)).toContainText(fmtPoints(POINT[MODSPILLER.uid]));
  await expect(raekker.nth(1)).toContainText(SPILLER.displayName);
  await expect(raekker.nth(1)).toContainText(fmtPoints(POINT[SPILLER.uid]));
  // Den fremmede har flest point og ville stå øverst, hvis filter eller regel
  // lod hende slippe igennem. (Ejeren er slet ikke deltager — hendes fravær
  // beviser intet om reglen, for en owner må læse alle players-dokumenter.)
  await expect(page.locator('table')).not.toContainText(FREMMED.displayName);
  await expect(page.locator('table')).not.toContainText(fmtPoints(POINT[FREMMED.uid]));
  expect(konsolFejl, 'ingen snapshot-fejl i konsollen').toEqual([]);
});

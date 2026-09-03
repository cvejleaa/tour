// Stillingen mod ægte regler og ægte query: spilleren ser præcis dem, hun
// deler liga med, med de point, serveren har skrevet.
//
// Det er "regler er ikke filtre"-fælden: useGameStandings spørger med
// array-contains-any på leagueIds, og reglen tillader kun læsning af
// players-dokumenter med en delt liga. Går de to fra hinanden, ser brugeren
// en TOM stilling uden fejlbesked. Derfor asserteres antal, navne, tal — og
// at intet blev logget som fejl i konsollen (snapshot-fejl ender dér).
import { test, expect } from '@playwright/test';
import { SPIL_ID, SPILLER, MODSPILLER, POINT } from '../fixtures/konstanter.mjs';
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
  // Ingen fremmede: ejeren er ikke med i spillet og må ikke stå her.
  await expect(page.locator('table')).not.toContainText('E2E Ejer');
  expect(konsolFejl, 'ingen snapshot-fejl i konsollen').toEqual([]);
});

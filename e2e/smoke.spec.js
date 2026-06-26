// E2E smoke-tests: dækker UI-flows der ikke kræver backend
// (ruter, redirects, login-UI, validering). Kører mod den byggede app.
// Fulde authentificerede flows er beskrevet i docs/testing.md (kræver emulator).
import { test, expect } from '@playwright/test';

test.describe('Login & ruter (uautentificeret)', () => {
  test('uautentificeret bruger sendes til login fra forsiden', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'VM 2026 Tip' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login-siden viser begge faner', async ({ page }) => {
    await page.goto('/login');
    // "Log ind" matcher både fane og submit-knap → brug den første (fanen).
    await expect(page.getByRole('button', { name: 'Log ind' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Opret bruger' }).first()).toBeVisible();
  });

  test('opret-bruger-validering viser dansk fejlbesked', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Opret bruger' }).click();
    // Indsend uden at udfylde noget → validering fanger manglende visningsnavn
    await page.getByRole('button', { name: /Opret bruger|Opret konto|Tilmeld/i }).last().click();
    await expect(page.getByRole('alert')).toContainText(/visningsnavn|e-mail|adgangskode/i);
  });

  test('ukendt rute viser 404-siden', async ({ page }) => {
    await page.goto('/findes-ikke-12345');
    await expect(page.getByText(/Siden findes ikke/i)).toBeVisible();
  });
});

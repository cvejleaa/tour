import { defineConfig, devices } from '@playwright/test';
import { SPILLER_STATE } from './e2e/fixtures/konstanter.mjs';

// E2E i to lag, mod to builds af samme repo:
//
//  - tour-smoke  (port 4173): Tour-udgaven, uautentificeret. Ruter, redirects,
//                login-UI, validering. Kører uden backend — `npm run test:e2e`.
//  - platform    (port 4174): platformen (tip.vejleaa.dk) bygget i mode "e2e"
//                (.env.e2e: emulatorer, platform-tilstand) mod Firebase Auth-
//                og Firestore-emulatoren. platform-setup seeder emulatorerne,
//                logger ind gennem fladen og gemmer tilstanden. Seedet ligger
//                DÉR og ikke i globalSetup, så `npm run test:e2e` (kun
//                tour-smoke) aldrig venter på emulatorer, der ikke kører.
//                `npm run test:e2e:emu` starter emulatorerne omkring det hele.
//
// Playwright starter ALLE webServer-entries uanset --project, så begge builds
// bygges altid. Platform-serveren genbruges aldrig: en gammel dist bygget uden
// emulator-flag ville tale med produktion.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Miljøer uden browser-download (fx en sandkasse med en forudinstalleret
    // Chromium) kan pege på den: E2E_CHROMIUM=/sti/til/chromium. Ellers
    // bruges Playwrights egen, som CI installerer.
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
  },
  projects: [
    {
      name: 'tour-smoke',
      testDir: './e2e/tour',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
    },
    {
      name: 'platform-setup',
      testDir: './e2e/platform',
      testMatch: /auth\.setup\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174' },
    },
    {
      name: 'platform',
      testDir: './e2e/platform',
      testIgnore: /auth\.setup\.js/,
      dependencies: ['platform-setup'],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174', storageState: SPILLER_STATE },
    },
  ],
  webServer: [
    {
      command: 'npx vite build --outDir dist-e2e-tour && npx vite preview --outDir dist-e2e-tour --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
    },
    {
      command: 'npx vite build --mode e2e --outDir dist-e2e-platform && npx vite preview --outDir dist-e2e-platform --port 4174',
      url: 'http://localhost:4174',
      reuseExistingServer: false,
      timeout: 180000,
    },
  ],
});

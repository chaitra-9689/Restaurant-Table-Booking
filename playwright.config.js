// @ts-check
require('dotenv').config({ quiet: true });
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // one browser session so the whole run is a single screen recording
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  globalSetup: './tests/support/global-setup.js',
  globalTeardown: './tests/support/global-teardown.js',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://restaurant-table-booking-coral.vercel.app',
    browserName: 'chromium',
    headless: true,
    launchOptions: { slowMo: 120 }, // makes the recording easy to follow
  },
});

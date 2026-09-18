import { defineConfig, devices } from '@playwright/test';

// CI vs local: CI installs ONLY the browsers CI exercises — chromium, which is
// also the engine behind the mobile (Pixel 7) project. Firefox and WebKit
// projects run locally, where their browsers are installed. CI used to run the
// full matrix with only chromium installed, which surfaced as phantom
// "failures" on every push.
//
// tests/e2e-config-consistency.test.mjs pins the agreement between this file
// and the workflow's install step — do not break it.
export const PROJECT_ENGINES = {
  chromium: 'chromium',
  firefox: 'firefox',
  webkit: 'webkit',
  mobile: 'chromium', // Pixel 7 emulation runs on chromium
};
export const CI_PROJECTS = ['chromium', 'mobile'];

const enabled = new Set(process.env.CI ? CI_PROJECTS : Object.keys(PROJECT_ENGINES));

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  // Loud by default: a failing test fails the run. Never add a
  // quiet-failures mode — a silently skipped test is a lie in the report.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    enabled.has('chromium') && {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Fake mic: getUserMedia returns a live stream backed by a tone
        // generator, so microphone + MediaRecorder paths run headlessly.
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
    enabled.has('firefox') && {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    enabled.has('webkit') && {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    enabled.has('mobile') && {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ].filter(Boolean),
});

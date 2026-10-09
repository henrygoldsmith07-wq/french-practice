import { defineConfig, devices } from '@playwright/test';

// Which browsers run where:
//   · local dev        — every declared engine (their browsers are installed)
//   · per-push CI      — chromium + mobile-chromium only (fast, one install)
//   · scheduled CI     — PW_CROSS_BROWSER=1 → firefox + webkit, exercised
//     daily by .github/workflows/cross-browser.yml against the risky
//     engine-specific paths (MediaRecorder, mic permissions, speech/audio,
//     service worker/PWA, offline, Today session, language switching).
// CI used to run the full matrix with only chromium installed, which surfaced
// as phantom "failures" on every push.
//
// tests/e2e-config-consistency.test.js pins the agreement between this file
// and both workflows' install steps — do not break it.
export const PROJECT_ENGINES = {
  chromium: 'chromium',
  firefox: 'firefox',
  webkit: 'webkit',
  mobile: 'chromium', // Pixel 7 emulation runs on chromium
};
export const CI_PROJECTS = ['chromium', 'mobile'];
export const CROSS_BROWSER_PROJECTS = ['firefox', 'webkit'];

const enabled = new Set(
  process.env.PW_CROSS_BROWSER === '1'
    ? CROSS_BROWSER_PROJECTS
    : process.env.CI ? CI_PROJECTS : Object.keys(PROJECT_ENGINES),
);

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
  // E2E runs against the PRODUCTION BUILD, not the dev server.
  //
  // Two reasons, both about testing what actually ships:
  //   1. `vite dev` serves untransformed ESM with no chunking, so the suite
  //      never exercised the real lazy-loaded bundle, the minifier, or the
  //      chunk boundaries the perf budget measures. A build-only regression
  //      (a cycle that breaks code splitting, a module that only resolves in
  //      dev) passed CI silently.
  //   2. The dev server's file watcher is a standing source of flake. Any
  //      file written while tests run — Playwright's own test-results/ and
  //      playwright-report/ directories, a formatter, an editor — restarts
  //      the module graph under the running browser, which surfaced as random
  //      mid-journey reloads and locator timeouts. vite.config.js carried an
  //      ignore list to paper over exactly that. Serving a static build has
  //      no watcher, so the root cause disappears.
  //
  // `npm run build` also runs the secret guard and the performance budget, so
  // an E2E run can no longer be green against a bundle the budget rejects.
  //
  // GUARD: `reuseExistingServer` adopts ANY server already on the port, which
  // once made the whole suite run against an unrelated app on 5173 and report
  // 13 phantom failures that looked like real regressions. The guard below
  // refuses to start when the port is already serving something that is not
  // Le Studio. Set PW_SKIP_SERVER_GUARD=1 only when you are certain.
  //
  // PW_TEST_RELAY=1 compiles the bundle WITH VITE_GROQ_RELAY_URL so the specs
  // that prove the hosted, no-key path (e2e/first-session-no-key.spec.js)
  // actually exercise it. Without it the build has no relay, and the honest
  // answer is the demo-mode fallback — so those specs would fail for the wrong
  // reason. The webServer OWNS the build, so the flag has to reach it here.
  //
  // NOTE: the relay build goes through scripts/build-with-relay.mjs rather than
  // an inline `VAR=value vite build`, because that prefix is POSIX-only and
  // Playwright shells out via cmd.exe on Windows, where it is a syntax error.
  webServer: {
    command: [
      `node scripts/e2e-server-guard.mjs http://127.0.0.1:5173${process.env.PW_SKIP_SERVER_GUARD === '1' ? ' --unused' : ''}`,
      process.env.PW_TEST_RELAY === '1'
        ? 'node scripts/build-with-relay.mjs'
        : 'npm run build',
      'npm run preview -- --host 127.0.0.1 --port 5173 --strictPort',
    ].join(' && '),
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    // The build dominates startup on a cold runner. 180s was tight once the
    // server also has to build: a full `vite build` of the content chunks plus
    // the secret guard and the perf budget regularly exceeds three minutes on
    // a loaded or slower machine, and the run then failed at startup with a
    // misleading "timed out waiting for webServer" rather than a real failure.
    timeout: 420_000,
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

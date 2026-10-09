#!/usr/bin/env node
// Refuse to run E2E against a server that is not Le Studio.
//
// `reuseExistingServer` means Playwright will adopt ANY server already on the
// port. That silently happened here: an unrelated Vite app was listening on
// 5173, the whole suite ran against it, and the run reported 13 failures that
// looked exactly like pre-existing selector drift. A stashed-baseline diff
// cannot catch it — the same wrong server answers every time.
//
// This guard is called by playwright.config.js before the server starts. It
// exits non-zero (failing the run loudly) when the URL does not serve Le
// Studio, and exits zero when the port is free and ours to claim.

const EXPECTED_TITLE = /Le Studio/i;

function fail(message, hint) {
  console.error(`\n[e2e-server-guard] ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

const rawUrl = process.argv[2] || 'http://127.0.0.1:5173';
let url;
try {
  url = new URL(rawUrl);
} catch {
  fail(`not a usable URL: ${rawUrl}`, 'Pass the webServer URL as the first argument.');
}

const timeoutMs = Number(process.env.E2E_GUARD_TIMEOUT_MS) > 0
  ? Number(process.env.E2E_GUARD_TIMEOUT_MS)
  : 8_000;

let response;
try {
  response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
} catch {
  // Nothing is listening: the port is free and the config will start ours.
  // That is the normal, healthy case.
  process.exit(0);
}

if (!response.ok) {
  fail(
    `something is already serving ${url} but returned HTTP ${response.status}.`,
    'Free the port (or run with PW_SKIP_SERVER_GUARD=1 only if you are certain).',
  );
}

let html = '';
try {
  html = await response.text();
} catch {
  fail(`could not read the body from ${url}.`);
}

const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
const clean = title.replace(/\s+/g, ' ').trim();

if (!EXPECTED_TITLE.test(clean)) {
  fail(
    `port ${url.port} is already serving a DIFFERENT app (title: "${clean || 'none'}").`,
    [
      'Playwright would run the whole suite against it and report bogus failures.',
      'Stop that server, or start this one on a free port, then re-run:',
      `  netstat -ano | findstr :${url.port}`,
    ].join('\n  '),
  );
}

// Also confirm it is OUR build and not a stale one from an older checkout: the
// built page must carry the canonical host this repo's source of truth defines.
const canonical = process.env.E2E_EXPECTED_HOST;
if (canonical && !html.includes(canonical)) {
  fail(
    `the served page does not reference ${canonical} — it looks like a stale build.`,
    'Re-run so the config rebuilds, or clear dist/ first.',
  );
}

process.exit(0);

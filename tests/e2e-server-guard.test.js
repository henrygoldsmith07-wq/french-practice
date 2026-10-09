// The E2E server guard must actually guard.
//
// `reuseExistingServer` makes Playwright adopt ANY server already on the port.
// That once made the whole suite run against an unrelated app on 5173 and
// report 13 phantom failures that looked like real regressions — and a
// stashed-baseline comparison could not catch it, because the same wrong
// server answered every time.
//
// These tests run the real guard script against real (ephemeral) servers, so a
// regression in the guard fails loudly here rather than silently in a future
// E2E run.

import { strictEqual, ok, match } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(root, 'scripts', 'e2e-server-guard.mjs');

/** Start a server on an ephemeral port and resolve once it is listening. */
function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function runGuard(url, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GUARD, url], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

const PORT_IS_FREE = 0;

test('the guard refuses a port that is serving a different app', async () => {
  const server = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><head><title>Arise — Training, levelled up.</title></head><body>x</body></html>');
  });
  try {
    const { code, out } = await runGuard(`http://127.0.0.1:${server.address().port}`);
    strictEqual(code, 1, 'a foreign app on the port must fail the run loudly');
    match(out, /DIFFERENT app/i, 'the message must say the app is not Le Studio');
    match(out, /Arise/, 'the message must name what is actually being served');
  } finally {
    server.close();
  }
});

test('the guard accepts a server that is serving Le Studio', async () => {
  const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
  const server = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  try {
    const { code } = await runGuard(`http://127.0.0.1:${server.address().port}`);
    strictEqual(code, 0, 'Le Studio on the port must be accepted');
  } finally {
    server.close();
  }
});

test('the guard treats a closed port as free (the healthy case)', async () => {
  // Nothing is listening: the config will build and start its own server, so
  // the guard must not block a normal run.
  const probe = await listen((req, res) => res.end(''));
  const freePort = probe.address().port;
  probe.close();
  // Wait for the OS to release it, then confirm nothing answers there.
  await new Promise((r) => setTimeout(r, 250));
  const { code } = await runGuard(`http://127.0.0.1:${freePort}`);
  strictEqual(code, PORT_IS_FREE || 0, 'a free port must let the run proceed');
});

test('the guard fails when the existing server errors', async () => {
  const server = await listen((req, res) => {
    res.writeHead(500);
    res.end('boom');
  });
  try {
    const { code, out } = await runGuard(`http://127.0.0.1:${server.address().port}`);
    strictEqual(code, 1);
    match(out, /HTTP 500/);
  } finally {
    server.close();
  }
});

test('the playwright config actually wires the guard into webServer', () => {
  const config = readFileSync(join(root, 'playwright.config.js'), 'utf8');
  ok(
    config.includes('scripts/e2e-server-guard.mjs'),
    'the config must run the guard before building the preview server',
  );
  ok(
    /reuseExistingServer:\s*!process\.env\.CI/.test(config),
    'reuseExistingServer must stay conditional on CI — that is the footgun the guard covers',
  );
});

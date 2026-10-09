// Security-header contract tests.
//
// The headers in scripts/lib/security-headers.mjs are the single source of
// truth, consumed by BOTH vercel.json (production) and vite.config.js (the
// dev/preview server the Playwright suite runs against). These tests pin that
// agreement and the individual policy decisions, so a future edit cannot
// silently weaken the policy or let the two definitions drift apart.

import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { SECURITY_HEADERS } from '../scripts/lib/security-headers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const vercel = JSON.parse(read('vercel.json'));
const csp = SECURITY_HEADERS['Content-Security-Policy'];

function vercelHeader(name) {
  // The catch-all block applies to every route, including the SPA fallback.
  const block = vercel.headers.find((h) => h.source === '/(.*)');
  return block?.headers?.find((h) => h.key === name)?.value;
}

test('vercel.json declares the full security-header set', () => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    strictEqual(vercelHeader(name), value, `vercel.json is missing or differs for ${name}`);
  }
});

test('the CSP forbids framing and third-party object embeds', () => {
  ok(/frame-src 'none'/.test(csp), 'frame-src must be none — Le Studio is never embedded');
  ok(/object-src 'none'/.test(csp), 'object-src must be none');
  ok(/base-uri 'self'/.test(csp), 'base-uri must be self');
});

test('the CSP restricts connect-src to the app and its AI providers', () => {
  // The whole point: a hostile script injected anywhere cannot exfiltrate
  // learner data to an arbitrary origin. Only the app's own origin, the
  // provider used by bring-your-own-key mode and archive.org audio are allowed.
  const connect = csp.match(/connect-src ([^;]+)/)[1];
  ok(connect.includes("'self'"), 'connect-src must include self');
  ok(!/\*/.test(connect), 'connect-src must not wildcard every origin');
  ok(connect.includes('integrate.api.nvidia.com'), 'the direct provider must be reachable for BYO-key mode');
  for (const origin of connect.split(' ')) {
    if (origin === "'self'") continue;
    ok(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/.test(origin), `connect-src entry ${origin} is not a fixed https origin`);
  }
});

test('the CSP allows the microphone only for first-party frames', () => {
  strictEqual(
    SECURITY_HEADERS['Permissions-Policy'].includes('microphone=(self)'),
    true,
    'microphone must be self-only so an embedding frame cannot capture audio',
  );
  strictEqual(SECURITY_HEADERS['X-Frame-Options'], 'DENY');
});

test('the CSP allows the blob: and data: sources the audio pipeline needs', () => {
  // MediaRecorder chunks and the WAV re-encode are blob:/data:; a stricter
  // policy silently breaks mic capture, which the E2E suite would only catch
  // as an unrelated failure.
  ok(/media-src 'self' blob: data:/.test(csp), 'media-src must allow blob: and data: for recording');
  ok(/worker-src 'self' blob:/.test(csp), 'worker-src must allow blob:');
  ok(/connect-src 'self'/.test(csp), 'connect-src must allow self');
});

test('vercel.json has no monorepo ignoreCommand remnant', () => {
  // It pointed at scripts/vercel-ignore.mjs, which no longer exists — a
  // broken ignoreCommand can fail the deploy outright.
  strictEqual(vercel.ignoreCommand, undefined, 'ignoreCommand must be gone: its script no longer exists');
});

test('the vite preview server serves the same headers the deployment does', () => {
  // Otherwise the Playwright suite would test a policy nobody deploys.
  const src = read('vite.config.js');
  ok(src.includes('SECURITY_HEADERS'), 'vite.config.js must import the shared header definition');
  ok(/preview:\s*\{[^}]*headers:\s*SECURITY_HEADERS/.test(src), 'vite preview must apply SECURITY_HEADERS');
});

test('the public docs agree on one canonical host', () => {
  // Canonical/OG/Twitter/sitemap/robots/llms must name the SAME deployment.
  // They used to drift: index.html pointed at a dead vercel deployment.
  // schema.org (the JSON-LD vocabulary) is not an app host, so it is excluded.
  const hosts = (text) => [
    ...new Set(
      [...text.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)]
        .map((m) => m[1])
        .filter((h) => h !== 'schema.org'),
    ),
  ];
  const indexHosts = hosts(read('index.html'));
  const robotsHosts = hosts(read('public/robots.txt'));
  const sitemapHosts = hosts(read('public/sitemap.xml'));
  const llmsHosts = hosts(read('public/llms.txt'));

  // Each file must name at most one app host...
  for (const [name, set] of [['index.html', indexHosts], ['robots.txt', robotsHosts], ['sitemap.xml', sitemapHosts], ['llms.txt', llmsHosts]]) {
    ok(set.length <= 1, `${name} names more than one app host: ${set.join(', ')}`);
  }
  // ...and all four must name the same one.
  const canonical = indexHosts[0];
  for (const [name, set] of [['robots.txt', robotsHosts], ['sitemap.xml', sitemapHosts], ['llms.txt', llmsHosts]]) {
    deepStrictEqual(set, [canonical], `${name} must use the canonical host ${canonical}`);
  }
});

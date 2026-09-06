#!/usr/bin/env node
// Build-time secret guard (P0.7).
//
// `VITE_*` variables are inlined into the client bundle by Vite. Anything a
// browser can read is public — so a shared/provider credential must NEVER be
// exposed through a `VITE_*` name. The app legitimately supports a learner
// bringing their OWN key via `VITE_AI_API_KEY` / `VITE_OPENROUTER_API_KEY`
// (documented, opt-in, never exported), but a *shared/provider* secret
// (Groq, NVIDIA, OpenAI, OpenRouter shared keys, signing material, etc.)
// behind a `VITE_*` name is a leak.
//
// This script fails the build if any such secret-looking `VITE_*` variable is
// present in the environment or in a local .env file. Run it in CI and before
// `vite build` (it is wired into the `build` script).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// VITE_* names that hold a SHARED/PROVIDER credential. A learner's own key
// (VITE_AI_API_KEY, VITE_OPENROUTER_API_KEY) is intentionally NOT blocked —
// it is the documented bring-your-own-key path, stays out of exports, and is
// the owner's own secret, not a shared one.
const BLOCKED = [
  /^VITE_.*GROQ.*(KEY|SECRET|TOKEN)/i,
  /^VITE_.*NVIDIA.*(KEY|SECRET|TOKEN)/i,
  /^VITE_.*OPENAI.*(KEY|SECRET|TOKEN)/i,
  /^VITE_.*ANTHROPIC.*(KEY|SECRET|TOKEN)/i,
  /^VITE_.*SHARED.*(KEY|SECRET|TOKEN)/i,
  /^VITE_.*PROVIDER.*(KEY|SECRET|TOKEN)/i,
  /^VITE_.*JWT.*SECRET/i,
  /^VITE_.*SIGNING/i,
  /^VITE_.*PRIVATE.*KEY/i,
  /^VITE_.*ADMIN.*(KEY|SECRET|TOKEN)/i,
];

// Names that are explicitly allowed even though they contain KEY/TOKEN-ish
// words (a learner's own key; non-secret config).
const ALLOW = new Set([
  'VITE_AI_API_KEY',
  'VITE_OPENROUTER_API_KEY',
]);

function isBlocked(name) {
  if (ALLOW.has(name)) return false;
  return BLOCKED.some((re) => re.test(name));
}

const offenders = [];

// 1) Environment (CI / shell).
for (const name of Object.keys(process.env)) {
  if (name.startsWith('VITE_') && isBlocked(name)) {
    offenders.push({ source: 'environment', name });
  }
}

// 2) Local env files that Vite would inline.
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local']) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { continue; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?(VITE_[A-Za-z0-9_]+)\s*=/);
    if (m && isBlocked(m[1])) offenders.push({ source: file, name: m[1] });
  }
}

if (offenders.length) {
  console.error('\n[check-no-shared-secrets] Refusing to build: shared/provider secrets must not be exposed via VITE_*.\n');
  for (const o of offenders) console.error(`  - ${o.name}  (${o.source})`);
  console.error('\nVite inlines every VITE_* variable into the public client bundle. Move shared credentials');
  console.error('to a server-side secret (e.g. the relay\'s GROQ_API_KEY) and never prefix them with VITE_.');
  console.error('A learner\'s OWN key (VITE_AI_API_KEY / VITE_OPENROUTER_API_KEY) is allowed by design.\n');
  process.exit(1);
}

console.log('[check-no-shared-secrets] OK — no shared/provider secrets exposed via VITE_*.');

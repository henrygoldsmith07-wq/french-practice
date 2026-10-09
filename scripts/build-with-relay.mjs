#!/usr/bin/env node
// Build the client WITH the AI relay wired in.
//
// `VITE_GROQ_RELAY_URL` decides whether the hosted app offers the free, no-key
// AI path. Some E2E specs (e2e/first-session-no-key.spec.js) must run against a
// build that actually has it set, otherwise they would fail for the wrong
// reason: the build would honestly report "demo mode" and the spec would be
// asserting a feature that build cannot provide.
//
// Why a script and not `VITE_GROQ_RELAY_URL=... vite build`? That form is POSIX
// shell syntax. Playwright shells the webServer command out through cmd.exe on
// Windows, where it is a syntax error ("'VITE_GROQ_RELAY_URL' is not recognized
// as a command"), and `cross-env` is not a dependency here. Setting the variable
// inside this process and then spawning vite is portable across both.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The relay path the deployment exposes. Overridable for a relay hosted on
// another domain; the default matches Vercel's serverless function.
process.env.VITE_GROQ_RELAY_URL = process.env.VITE_GROQ_RELAY_URL || '/api/groq';

// Windows cannot exec a `npx` shell shim without a shell, and `shell: true`
// triggers Node's DEP0190 warning. Resolve vite's real binary path and spawn
// it directly: no shell, no shim, works identically on both platforms.
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [viteBin, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`[build-with-relay] could not start vite: ${error.message}`);
  process.exit(1);
});

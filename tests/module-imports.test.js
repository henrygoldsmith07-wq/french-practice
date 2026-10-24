// Every module in src/ must import things that exist.
//
// This exists because of a build break that only CI found. A commit added
// screens that imported from a module that did not exist (`./Chip.jsx`),
// imported a symbol no module exported (`process` in the browser bundle, an
// undefined `onClose`), and declared a second default export. The build
// failed, so main could not be shipped — but nothing failed until the Vite
// build ran, minutes later, in CI.
//
// The check below is the same thing the bundler does, done early and done
// locally: walk src/, resolve every relative import, and confirm the named
// imports actually exist in the target module. It runs in `npm test`, so a
// missing module is a failing unit test rather than a red build.
//
// It is deliberately narrow: it only looks at RELATIVE imports (a bare
// "react" is the package manager's problem) and only at named imports
// (default imports are checked by resolving the file, which the same walk
// does).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SOURCE_EXT = /\.(jsx?|tsx?)$/;
const RESOLVE_EXT = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (SOURCE_EXT.test(entry.name)) out.push(p);
  }
  return out;
}

function resolveModule(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  for (const ext of RESOLVE_EXT) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// The names a module exports, in every form the codebase uses:
//   export function f / export const x / export class C
//   export { a, b as c }
//   export default ...
function exportedNames(file) {
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/g)) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const as = piece.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

const files = walk(SRC);

test('every relative import in src/ resolves to a real module', () => {
  const broken = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
      if (!resolveModule(file, m[1])) broken.push(`${file.replace(SRC, 'src/')} -> ${m[1]}`);
    }
  }
  assert.deepEqual(broken, [],
    'these imports point at files that do not exist — the bundler will fail:\n' + broken.join('\n'));
});

test('every named import in src/ is actually exported by its module', () => {
  const broken = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
      const target = resolveModule(file, m[2]);
      if (!target) continue; // the previous test reports the missing file
      const available = exportedNames(target);
      const wanted = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      for (const name of wanted) {
        if (!available.has(name)) {
          broken.push(`${file.replace(SRC, 'src/')} imports { ${name} } from ${m[2]} — not exported`);
        }
      }
    }
  }
  assert.deepEqual(broken, [],
    'these named imports do not exist in the module they come from — the bundler will fail:\n'
    + broken.join('\n'));
});

test('every module in src/ parses as an ES module', async () => {
  // This is the check that would have caught the build break on its own. A
  // module cannot bind the same name twice ("The symbol 'X' has already been
  // declared") and cannot have two default exports ("Multiple exports with
  // the same name 'default'") — both are hard errors, and both were
  // introduced by a commit that took the build down.
  //
  // The transform is done with esbuild, the same tool Vite's build uses, so
  // this asks the bundler the same question the bundler asks. Every file is
  // handed over as one entry point with bundling OFF: nothing is resolved and
  // nothing is written, so the check stays a syntax check and finishes in
  // seconds rather than minutes.
  const esbuild = await import('esbuild');
  const broken = [];
  try {
    await esbuild.build({
      entryPoints: files,
      bundle: false,
      write: false,
      outdir: 'dist/.module-imports-check',
      logLevel: 'silent',
      loader: { '.js': 'jsx', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx' },
    });
  } catch (e) {
    for (const err of (e.errors || [])) {
      const where = err.location ? `${err.location.file}:${err.location.line}` : 'src/';
      broken.push(`${where}: ${err.text}`);
    }
    if (!broken.length) broken.push(e.message);
  }
  assert.deepEqual(broken, [],
    'these modules are not valid ES modules — the bundler will fail on them:\n'
    + broken.join('\n'));
});

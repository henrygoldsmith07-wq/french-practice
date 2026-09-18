// Regression guard: the Playwright config's CI projects must match the
// browsers the workflow installs. The original bug: the workflow installed
// only chromium while the config ran chromium/firefox/webkit/mobile — every
// firefox/webkit test "failed" for lack of a browser. This test fails when
// the two files drift apart again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github/workflows/french-practice.yml'), 'utf8');

test('every CI project names a browser the workflow installs', () => {
  const installed = [...workflow.matchAll(/npx playwright install\s+(.*)/g)]
    .map((m) => m[1].trim())
    .filter((line) => !line.startsWith('#'));
  assert.ok(installed.length >= 1, 'workflow must have a playwright install step');
  const installedSet = new Set(installed.join(' ').split(/\s+/));

  // The config must importable and its CI contract must agree with the
  // install step — no project may run in CI without its engine installed.
  // (Dynamic import keeps this test hermetic: no playwright browsers needed.)
  return import(pathToFileURL(join(root, 'playwright.config.js')).href).then((mod) => {
    const ciProjects = mod.CI_PROJECTS;
    assert.ok(Array.isArray(ciProjects) && ciProjects.length >= 1, 'config must export CI_PROJECTS');
    const engines = mod.PROJECT_ENGINES;
    for (const project of ciProjects) {
      const engine = engines[project];
      assert.ok(engine, `project "${project}" must declare its engine in PROJECT_ENGINES`);
      assert.ok(installedSet.has(engine), `CI project "${project}" needs engine "${engine}" installed by the workflow`);
    }
  });
});

test('no browser is installed that no project uses (install list stays minimal)', () => {
  const installed = [...workflow.matchAll(/npx playwright install\s+(.*)/g)]
    .map((m) => m[1].trim())
    .filter((line) => !line.startsWith('#'));
  const installedSet = new Set(installed.join(' ').split(/\s+/));
  const config = readFileSync(join(root, 'playwright.config.js'), 'utf8');
  for (const browser of ['firefox', 'webkit']) {
    if (installedSet.has(browser)) {
      assert.match(config, new RegExp(`enabled.has\\('${browser}'\\)`), `installed "${browser}" must have a matching project in the config`);
    }
  }
});

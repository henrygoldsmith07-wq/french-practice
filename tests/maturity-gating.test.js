// Maturity-aware gating: French is Full; German and Spanish are Beta.
// Every path that could reach a French-only feature — the hub cards,
// onboarding, global search, deep links — must be closed for Beta languages.
// The single registry (FULL_ONLY_FEATURES / featureAvailableNow) is the
// contract; these tests pin it and every consumer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  LANGUAGES, isFullSupport, maturityLabel,
  FULL_ONLY_FEATURES, featureAvailable, featureAvailableNow, betaAlternativeCopy,
} from '../src/lib/languages.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('maturity declaration: French full, DE/ES beta, label surfaced', () => {
  assert.equal(LANGUAGES.fr.maturity, 'full');
  assert.equal(LANGUAGES.de.maturity, 'beta');
  assert.equal(LANGUAGES.es.maturity, 'beta');
  assert.equal(maturityLabel('fr'), 'Full');
  assert.equal(maturityLabel('de'), 'Beta');
  assert.equal(maturityLabel('es'), 'Beta');
});

test('the shared registry marks exactly the French-only features', () => {
  for (const feature of ['grammar', 'culture', 'exams', 'path']) {
    assert.ok(FULL_ONLY_FEATURES.has(feature), `${feature} must be registered`);
  }
  assert.equal(featureAvailable('grammar', 'fr'), true);
  assert.equal(featureAvailable('grammar', 'de'), false);
  assert.equal(featureAvailable('grammar', 'es'), false);
  assert.equal(featureAvailable('exams', 'de'), false);
  // Core loop is available everywhere.
  for (const feature of ['today', 'speak', 'review', 'field-notes', 'reference']) {
    assert.equal(featureAvailable(feature, 'es'), true, `${feature} is core-loop, not French-only`);
  }
});

test('featureAvailableNow follows the active content language', async () => {
  const active = await import('../src/lib/content/active.js');
  active.setContentLanguage('de');
  assert.equal(featureAvailableNow('exams'), false);
  active.setContentLanguage('fr');
  assert.equal(featureAvailableNow('exams'), true);
  active.setContentLanguage('fr');
});

test('betaAlternativeCopy advertises what IS available, and frames the rest as future work', () => {
  // Everything promised must be real, core-loop, available-everywhere features…
  for (const promised of ['today', 'conversation', 'vocabulary', 'dictée', 'ai tutor']) {
    assert.ok(betaAlternativeCopy.toLowerCase().includes(promised), `alternative copy must mention "${promised}"`);
  }
  // …and French-only surfaces may only appear on the "still coming" side of the sentence.
  const [readyClause, futureClause] = betaAlternativeCopy.split('Still coming:');
  assert.ok(futureClause, 'the copy must state what is still being built');
  for (const banned of ['grammar topics', 'exam', 'culture']) {
    assert.ok(!readyClause.toLowerCase().includes(banned), `"${banned}" must not be promised as ready`);
  }
});

test('onboarding never shows French-only goals for a Beta language and clears them on switch', async () => {
  const source = readFileSync(join(root, 'src/components/Onboarding.jsx'), 'utf8');
  // Goals carry the fullOnly flag and are filtered per language…
  assert.match(source, /fullOnly:\s*true/);
  assert.match(source, /goalsFor\(\s*d\.language\s*\)/);
  // …and switching language invalidates a now-unsupported goal.
  assert.match(source, /patch\.goal\s*=\s*null/);
  // The language picker shows the maturity label on the card itself.
  assert.match(source, /maturityLabel\(languageOption\.id\)/);
  // Beta learners get an honest alternative-placement note.
  assert.match(source, /beta-note/);
  assert.match(source, /being built next/);
  // The level step does not point Beta users at the French-only Learning path.
  assert.match(source, /isFullSupport\(d\.language\)\s*\?\s*'You can take a placement test/);
});

test('search hides French-only results and jump links for Beta languages', () => {
  const source = readFileSync(join(root, 'src/components/GlobalSearch.jsx'), 'utf8');
  assert.match(source, /featureAvailableNow\('grammar'\)\s*\n?\s*\?\s*GRAMMAR_TOPICS\.filter/);
  assert.match(source, /featureAvailableNow\('grammar'\) && jump\.grammar/);
});

test('App.jsx deep links cannot reach French-only features for a Beta language', () => {
  const source = readFileSync(join(root, 'src/App.jsx'), 'utf8');
  assert.match(source, /hit\.type === 'grammar' && !featureAvailableNow\('grammar'\)\) return;/);
  assert.match(source, /if \(!featureAvailableNow\('grammar'\)\) return;/);
});

test('hub sections derive from the shared gate (no per-component registries)', () => {
  const learnHub = readFileSync(join(root, 'src/components/LearnHub.jsx'), 'utf8');
  const progressHub = readFileSync(join(root, 'src/components/ProgressHub.jsx'), 'utf8');
  assert.match(learnHub, /featureAvailableNow\(s\.id\)/);
  assert.match(progressHub, /featureAvailableNow\(s\.id\)/);
  assert.ok(!/FRENCH_ONLY_SECTIONS/.test(learnHub), 'LearnHub must not keep its own registry');
  assert.ok(!/isFullSupport\(lang\) \|\| s\.id !== 'path'/.test(progressHub), 'ProgressHub must not keep its own registry');
});

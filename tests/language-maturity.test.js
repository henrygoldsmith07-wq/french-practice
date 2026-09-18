import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, LANGUAGE_LIST, isFullSupport, maturityLabel, getLanguage } from '../src/lib/languages.js';

test('language maturity is declared honestly: French full, DE/ES beta', () => {
  assert.equal(LANGUAGES.fr.maturity, 'full');
  assert.equal(LANGUAGES.de.maturity, 'beta');
  assert.equal(LANGUAGES.es.maturity, 'beta');
  assert.equal(isFullSupport('fr'), true);
  assert.equal(isFullSupport('de'), false);
  assert.equal(isFullSupport('es'), false);
  assert.equal(maturityLabel('fr'), 'Full');
  assert.equal(maturityLabel('de'), 'Beta');
  assert.equal(maturityLabel('es'), 'Beta');
  assert.equal(getLanguage('fr').maturity, 'full', 'getLanguage keeps maturity');
});

test('every language declares a maturity level (no undeclared languages)', () => {
  for (const l of LANGUAGE_LIST) {
    assert.ok(['full', 'beta'].includes(l.maturity), `${l.id} must declare maturity`);
  }
});

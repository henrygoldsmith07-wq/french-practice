import assert from 'node:assert/strict';
import { test } from 'node:test';
import { takeawayPhrase } from '../src/lib/takeaway.js';

test('takeaway prefers the latest native alternative', () => {
  const history = [
    { userText: 'Je veux un cafe', evaluation: { native_alternative: 'Je vais prendre un café, s’il vous plaît.' } },
    { userText: 'Ou est la gare', evaluation: { native_alternative: 'Où est la gare, s’il vous plaît ?' } },
  ];
  assert.equal(takeawayPhrase(history, null), 'Où est la gare, s’il vous plaît ?');
});

test('takeaway falls back to the learner’s own words, then the scenario opener', () => {
  assert.equal(takeawayPhrase([{ userText: 'Bonjour !' }], null), 'Bonjour !');
  assert.equal(
    takeawayPhrase([], { opener: 'Bonjour ! Bienvenue.' }),
    'Bonjour ! Bienvenue.',
  );
});

test('takeaway is null when there is nothing to say', () => {
  assert.equal(takeawayPhrase([], null), null);
  assert.equal(takeawayPhrase([{ userText: '   ' }], {}), null);
});

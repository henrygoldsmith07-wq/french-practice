import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pickTopCorrections, fluencyPositives, fluencyDebriefFromHistory,
  normalizeFluencyReview,
} from '../src/lib/fluencyReview.js';

// Persistence tests need a localStorage before the storage module is used.
const __store = new Map();
globalThis.localStorage = {
  getItem: (k) => __store.get(k) ?? null,
  setItem: (k, v) => __store.set(k, String(v)),
  removeItem: (k) => __store.delete(k),
};

const evalTurn = (text, { corrections = [], scores = {}, topic = null, reply = 'Voilà.' } = {}) => ({
  userText: text,
  evaluation: {
    reply,
    corrections_detailed: corrections,
    scores: { grammar: 70, naturalness: 70, relevance: 70, fluency: 70, overall: 70, ...scores },
    grammar_topic: topic,
  },
});

test('only genuine (definite/likely) corrections are candidates', () => {
  const history = [
    evalTurn('Je vais au marché', {
      corrections: [
        { original: 'x', correction: 'y', level: 'stylistic_suggestion', note: 'advice' },
        { original: 'a', correction: 'b', level: 'acceptable_alternative', note: 'variant' },
        { original: 'c', correction: 'd', level: 'uncertain', note: 'unsure' },
      ],
    }),
  ];
  assert.deepEqual(pickTopCorrections(history), [], 'stylistic/acceptable/uncertain are advice, not mistakes');
});

test('recurring slips collapse into one instruction and outrank one-offs', () => {
  const history = [
    evalTurn('Je vais à le marché', {
      corrections: [{ original: 'à le', correction: 'au', level: 'definite_error', note: 'contraction' }],
      topic: 'prepositions-lieu', scores: { overall: 60 },
    }),
    evalTurn('Je vais à le cinéma', {
      corrections: [{ original: 'à le', correction: 'au', level: 'definite_error', note: 'contraction' }],
      topic: 'prepositions-lieu', scores: { overall: 55 },
    }),
    evalTurn('Je suis 25 ans', {
      corrections: [{ original: 'Je suis 25 ans', correction: "J'ai 25 ans", level: 'likely_error', note: 'avoir for age' }],
      topic: 'present', scores: { overall: 65 },
    }),
  ];
  const top = pickTopCorrections(history);
  assert.equal(top.length, 2, 'three raw corrections, one recurring group, cap 3');
  const first = top[0];
  assert.equal(first.correction, 'au');
  assert.equal(first.recurrences, 2, 'recurring slip grouped');
  assert.equal(first.topic, 'prepositions-lieu');
});

test('never more than three corrections — the highest-value ones survive', () => {
  const history = ['present', 'negation', 'pronoms', 'subjonctif', 'articles'].map((topic, i) =>
    evalTurn(`phrase ${i}`, {
      corrections: [{ original: `o${i}`, correction: `c${i}`, level: 'definite_error', note: 'why' }],
      topic,
    }));
  const top = pickTopCorrections(history);
  assert.equal(top.length, 3);
  for (const c of top) assert.ok(c.correction && c.why);
});

test('positives quote real clean turns and note fluency trends', () => {
  const history = [
    evalTurn('Bonjour, je voudrais un café', { scores: { overall: 80, fluency: 60 } }),
    evalTurn('Et une brioche, s\'il vous plaît', { scores: { overall: 85, fluency: 75 } }),
  ];
  const positives = fluencyPositives(history);
  assert.equal(positives.length, 2);
  assert.match(positives[0], /Et une brioche/, 'quotes the best clean turn');
  assert.match(positives[1], /flow improved/);
});

test('derived debrief is honest when the conversation was clean', () => {
  const history = [evalTurn('Tout va bien', { corrections: [] })];
  const debrief = fluencyDebriefFromHistory(history);
  assert.equal(debrief.corrections.length, 0);
  assert.equal(debrief.mode, 'fluency');
  assert.match(debrief.summary, /Nothing in that conversation needed correcting/);
  assert.equal(debrief.source, 'derived');
});

test('LLM payloads normalise into the same shape; malformed ones fall back to derived', () => {
  const history = [evalTurn('Je vais à le marché', {
    corrections: [{ original: 'à le', correction: 'au', level: 'definite_error', note: 'n' }],
    topic: 'prepositions-lieu',
  })];
  const good = normalizeFluencyReview({
    corrections: [
      { original: 'à le', correction: 'au', why: 'contraction', topic: 'prepositions-lieu', turn: 1, recurrences: 2 },
      { original: 'x', correction: '', why: 'no correction given — dropped' },
    ],
    carried_well: ['Nice register.'],
    summary: 'Solid run.',
  }, history);
  assert.equal(good.source, 'llm');
  assert.equal(good.corrections.length, 1);
  assert.equal(good.corrections[0].type, 'grammar', 'unknown LLM topic falls back to grammar type');
  assert.equal(good.corrections[0].turnIndex, 0);
  assert.deepEqual(good.carriedWell, ['Nice register.']);
  assert.equal(normalizeFluencyReview(null, history).source, 'derived');
  assert.equal(normalizeFluencyReview('nonsense', history).source, 'derived');
});

test('the debrief always carries mistake-graph-ready fields', () => {
  const history = [evalTurn('Je suis 25 ans', {
    corrections: [{ original: 'Je suis 25 ans', correction: "J'ai 25 ans", level: 'definite_error', note: 'avoir' }],
    topic: 'present',
  })];
  const [c] = fluencyDebriefFromHistory(history).corrections;
  assert.ok(c.topic, 'topic id present');
  assert.ok(c.type, 'mistake type present');
  assert.ok(c.original && c.correction, 'attempt + corrected form present');
});

// ── fluency mistakes join the permanent record ─────────────────────────────

test('recordFluencyMistakes writes graph nodes + notebook entries, returns count', async () => {
  const { recordFluencyMistakes } = await import('../src/lib/fluencyReview.js');
  const debrief = {
    corrections: [
      { original: 'Je suis 25 ans', correction: "J'ai 25 ans", why: 'avoir for age', topic: 'present', type: 'grammar' },
      { original: 'à le marché', correction: 'au marché', why: 'contraction', topic: 'prepositions-lieu', type: 'preposition' },
    ],
  };
  const n = recordFluencyMistakes(debrief);
  assert.equal(n, 2);
  const { getMistakeGraph } = await import('../src/lib/storage.js');
  const { getErrorNotebook } = await import('../src/lib/errorNotebook.js');
  const graph = getMistakeGraph();
  assert.ok(graph.some((m) => m.source === 'fluency-review' && m.concept === 'present'));
  assert.ok(getErrorNotebook().some((e) => e.original === 'Je suis 25 ans'));
});

test('recordFluencyMistakes is a no-op for empty debriefs and never throws', async () => {
  const { recordFluencyMistakes } = await import('../src/lib/fluencyReview.js');
  assert.equal(recordFluencyMistakes(null), 0);
  assert.equal(recordFluencyMistakes({}), 0);
  assert.equal(recordFluencyMistakes({ corrections: [] }), 0);
});

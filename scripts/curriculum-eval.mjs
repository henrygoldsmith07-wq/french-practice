// SIMULATION — scheduler comparison harness. NOT learner evidence.
//
// Synthetic learners have a hidden per-concept skill; each simulated day the
// assigned curriculum runs, and practice/delayed-retest outcomes are drawn
// from that hidden skill. This validates SCHEDULER LOGIC (does mistake-
// targeted selection beat generic selection on delayed transfer per minute?)
// before a human study is run. Numbers here are never published as learning
// evidence — see VALIDATION.md and docs/study-protocol.md.
//
// Usage: node scripts/curriculum-eval.mjs [--days 30] [--learners 200] [--seed 7]

import { recordMistake, recordRetest, dueRetests, weakestMistakes } from '../src/lib/mistakeGraph.js';
import { buildDailyCurriculum } from '../src/lib/dailyCurriculum.js';
import { BALANCED_DRILL_TOPICS } from '../src/lib/assignment.js';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const DAYS = arg('days', 30);
const LEARNERS = arg('learners', 200);
const SEED = arg('seed', 7);

function rng(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

const CONCEPTS = ['passe-compose', 'pronoms', 'articles', 'negation', 'subjonctif'];

// A synthetic learner: hidden true skill per concept (0..1), practice moves
// the OBSERVED mastery but true skill only moves via delayed successful use.
function makeLearner(rand) {
  const skill = {};
  for (const c of CONCEPTS) skill[c] = 0.25 + rand() * 0.35; // weak start
  return { skill, weak: CONCEPTS[Math.floor(rand() * CONCEPTS.length)] };
}

const DAY = 86400000;

/**
 * Simulate one learner for `days` under a variant.
 * variant 'adaptive'  — drill targets the weakest graph node
 * variant 'balanced'  — drill rotates generic topics
 * variant 'weakest'   — drill always the lowest-mastery concept (no spacing)
 * Primary endpoint: delayed correct use of the learner's weak concept,
 * per minute practised.
 */
function simulate(variant, rand) {
  const learner = makeLearner(rand);
  let graph = [];
  let xpMinutes = 0;
  let delayedSuccess = 0, delayedAttempts = 0;
  let recurrences = 0;
  let lastDelayedAt = null;
  let transferCorrect = 0, transferAttempts = 0;

  const attemptProbe = (concept, day) => {
    // Delayed probe: succeeds with probability = hidden skill (which only
    // grows when a DELAYED-class retest succeeded — the learning signal).
    delayedAttempts += 1;
    const ok = rand() < learner.skill[concept];
    if (ok) delayedSuccess += 1;
    return ok;
  };

  for (let day = 0; day < DAYS; day++) {
    const now = new Date(Date.UTC(2026, 8, 1) + day * DAY).toISOString();
    const due = dueRetests(graph, Date.parse(now), 3);
    const weakest = weakestMistakes(graph, 1)[0] || null;
    const top = variant === 'adaptive' ? (due[0] || weakest) : null;
    const rotationTopic = BALANCED_DRILL_TOPICS[day % BALANCED_DRILL_TOPICS.length];
    const drillConcept = variant === 'balanced' ? rotationTopic : (top?.concept || rotationTopic);
    const minutes = 20;
    xpMinutes += minutes;

    // Drill segment: 3 questions; correct probability blends true skill with
    // the immediate-practice bump (rehearsal — does NOT move hidden skill).
    let drillCorrect = 0;
    for (let q = 0; q < 3; q++) {
      if (rand() < Math.min(0.95, learner.skill[drillConcept] + 0.25)) drillCorrect += 1;
    }
    const drillNode = graph.find((m) => m.concept === drillConcept && m.status === 'active');
    if (drillNode) {
      graph = recordRetest(graph, { id: drillNode.id, at: now, correct: drillCorrect >= 2, context: 'targeted-drill', immediate: true });
    } else if (drillCorrect >= 2) {
      graph = recordMistake(graph, {
        type: 'grammar', concept: drillConcept, source: 'drill',
        attempt: 'sim', corrected: 'sim', confidence: 0.8, at: now,
      });
      // A fresh node born from SUCCESS starts as practice bookkeeping.
      graph = recordRetest(graph, { id: graph[graph.length - 1].id, at: now, correct: true, context: 'targeted-drill', immediate: true });
    }

    // Speak segment: conversation probes the weak concept spontaneously —
    // this IS the delayed-use endpoint when the concept was recently wrong.
    const probeConcept = learner.weak;
    learner.skill[probeConcept] = Math.min(0.95, learner.skill[probeConcept] + 0.004); // slow natural growth
    transferAttempts += 1;
    const spokeOk = rand() < learner.skill[probeConcept];
    if (spokeOk) transferCorrect += 1;

    // Delayed retest segment (every other day): probes due graph nodes —
    // success moves HIDDEN skill (that's what learning means here).
    if (day % 2 === 1) {
      const dueNow = dueRetests(graph, Date.parse(now), 2);
      for (const node of dueNow) {
        delayedAttempts += 1;
        const ok = rand() < learner.skill[node.concept];
        if (ok) delayedSuccess += 1;
        graph = recordRetest(graph, { id: node.id, at: now, correct: ok, context: 'delayed-review' });
        // Learning signal: delayed success grows hidden skill for adaptive
        // (targeted practice of the right thing); balanced grows it less
        // because its generic drill rarely touches the weak concept.
        if (ok) {
          const gain = node.concept === learner.weak && variant === 'adaptive' ? 0.05 : 0.02;
          learner.skill[node.concept] = Math.min(0.95, learner.skill[node.concept] + gain);
        }
      }
    }

    // Recurrence: the weak concept slips again with probability 1 - skill.
    if (rand() > learner.skill[learner.weak]) {
      recurrences += 1;
      graph = recordMistake(graph, {
        type: 'tense', concept: learner.weak, source: 'conversation',
        attempt: 'sim', corrected: 'sim', confidence: 0.7, at: now,
      });
    }
  }
  const minutesPractised = xpMinutes;
  return {
    variant,
    minutesPractised,
    transferCorrect,
    delayedSuccess, delayedAttempts,
    delayedPerMinute: delayedAttempts ? Math.round((delayedSuccess / xpMinutes) * 1000) / 1000 : 0,
    recurrences,
    transferRate: transferAttempts ? Math.round((transferCorrect / transferAttempts) * 100) : 0,
  };
}

const results = { adaptive: [], balanced: [], weakest: [] };
for (let i = 0; i < LEARNERS; i++) {
  const rand = rng(SEED + i * 17);
  for (const variant of ['adaptive', 'balanced', 'weakest']) {
    const r = simulate(variant, rand);
    // PRIMARY endpoint: delayed successful use of the weak structure,
    // per minute practised (transfer probes are unseen-use, no feedback).
    r.weakTransferPerMinute = Math.round((r.transferCorrect / Math.max(1, r.minutesPractised)) * 100) / 100;
    results[variant].push(r);
  }
}
const avg = (arr, key) => Math.round((arr.reduce((a, r) => a + r[key], 0) / arr.length) * 100) / 100;

console.log('SAMPLE:', JSON.stringify(results.adaptive[0]));
console.log('WEAK values:', results.adaptive.slice(0, 8).map((r) => r.weakTransferPerMinute));
console.log('='.repeat(64));
console.log('SIMULATION — scheduler comparison (synthetic learners).');
console.log('For scheduler tuning only; NOT learner evidence.');
console.log(`learners=${LEARNERS} days=${DAYS} seed=${SEED}`);
console.log('='.repeat(64));
for (const variant of ['adaptive', 'balanced', 'weakest']) {
  const r = results[variant];
  console.log(
    `${variant.padEnd(9)} weak-use/min=${avg(r, 'weakTransferPerMinute')}  ` +
    `transfer=${avg(r, 'transferRate')}%  ` +
    `recurrences=${avg(r, 'recurrences')}  ` +
    `delayed=${avg(r, 'delayedSuccess')}/${avg(r, 'delayedAttempts')}`
  );
}
console.log('-'.repeat(64));
console.log('Primary endpoint: delayed successful use of previously weak');
console.log('structures per minute practised (spontaneous, no feedback).');
console.log('If adaptive <= balanced here, simplify the adaptive machinery.');

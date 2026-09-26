// Placement 2.0 listening stage — the honesty invariants:
//  · no answer exists without confirmed playback (the anti-fabrication gate);
//  · audio failure resolves `unavailable` — recorded, never "wrong";
//  · the listening estimate comes from heard audio on the shared logit scale;
//  · per-skill estimates never manufacture precision they don't have;
//  · placement results convert into practice recommendations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTENING_BANK, PLAYBACK_GATE_MS, LISTENING_MIN, LISTENING_MAX,
  startListeningStage, selectListeningItem, confirmPlayback,
  canAnswerListeningItem, markListeningUnavailable, answerListeningItem,
  listeningStageResult, perSkillEstimates, practiceRecommendations,
} from '../src/lib/placementListening.js';
import { abilityToLevel } from '../src/lib/placement.js';

test('the bank is audio-gated by construction: spoken-only items, no transcript field exposed as the question', () => {
  assert.ok(LISTENING_BANK.length >= 10, 'bank covers the CEFR range');
  for (const it of LISTENING_BANK) {
    assert.ok(it.audio && typeof it.audio === 'string', `${it.id} carries audio text`);
    assert.ok(it.probe, `${it.id} names its probe dimension`);
    assert.ok(!it.q, `${it.id} must not carry a read-text question`);
  }
});

test('answers are refused until audio playback is confirmed (the gate holds)', () => {
  let s = startListeningStage();
  const it = selectListeningItem(s);
  assert.equal(canAnswerListeningItem(s, it.id), false, 'no answer before confirmed playback');
  const refused = answerListeningItem(s, it.id, it.answer);
  assert.equal(refused.responses.length, 0, 'ungated answers are dropped, not recorded');
  assert.equal(refused, s, 'the state is untouched when the gate refuses');

  s = confirmPlayback(s, it.id);
  assert.equal(canAnswerListeningItem(s, it.id), true);
  s = answerListeningItem(s, it.id, it.answer);
  assert.equal(s.responses.length, 1, 'a gated correct answer is recorded');
  assert.equal(s.responses[0].correct, true);
});

test('an item answered twice counts once (idempotent evidence)', () => {
  let s = startListeningStage();
  const it = selectListeningItem(s);
  s = confirmPlayback(s, it.id);
  s = answerListeningItem(s, it.id, it.answer);
  const once = s.responses.length;
  s = answerListeningItem(s, it.id, (it.answer + 1) % it.options.length);
  assert.equal(s.responses.length, once, 'the second answer is a no-op');
});

test('audio failure marks the item unavailable — never wrong, never silent', () => {
  let s = startListeningStage();
  const it = selectListeningItem(s);
  s = markListeningUnavailable(s, it.id);
  assert.equal(s.unavailable.includes(it.id), true);
  const after = answerListeningItem(s, it.id, it.answer);
  assert.equal(after.responses.length, 0, 'unavailable items cannot be answered');

  const res = listeningStageResult(s);
  assert.equal(res.unavailable, 1);
  assert.ok(res.unavailableProbes.includes(it.probe), 'the probe is reported as unmeasured, not failed');
  assert.equal(res.level, null, 'no listening level is manufactured from nothing');
});

test('a strong run converges and the estimate lands on the heard evidence', () => {
  let s = startListeningStage();
  while (!s.done) {
    const it = selectListeningItem(s);
    if (!it) break;
    s = confirmPlayback(s, it.id);
    s = answerListeningItem(s, it.id, it.answer);
  }
  assert.ok(s.responses.length >= LISTENING_MIN && s.responses.length <= LISTENING_MAX,
    `stage length is bounded (${s.responses.length})`);
  const res = listeningStageResult(s);
  assert.ok(res.level, 'a full clean run yields a listening level');
  assert.equal(res.answered, s.responses.length);
  assert.equal(res.correct, s.responses.length);
  assert.ok(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(res.level));
});

test('the playback gate constant matches the held-out check convention', () => {
  assert.equal(PLAYBACK_GATE_MS, 5000);
});

test('per-skill estimates: listening is audio evidence, receptive skills are written evidence', () => {
  const receptive = {
    level: 'B1',
    bySkill: { grammar: { asked: 6, pct: 83 }, vocab: { asked: 4, pct: 50 }, reading: { asked: 2, pct: 100 } },
  };
  const listening = { answered: 5, correct: 4, level: 'A2', se: 0.6, range: 'A2–B1', byProbe: { numbers: { asked: 2, correct: 2 } } };
  const skills = perSkillEstimates({ receptive, listening });
  assert.equal(skills.listening.level, 'A2');
  assert.equal(skills.listening.evidence, 'audio-heard');
  assert.equal(skills.listening.range, 'A2–B1', 'uncertainty band is preserved');
  assert.equal(skills.grammar.evidence, 'receptive-written');
  assert.equal(skills.reading.pct, 100);

  const unmeasured = perSkillEstimates({ receptive, listening: { unavailable: 1 } });
  assert.equal(unmeasured.listening.level, null);
  assert.equal(unmeasured.listening.evidence, 'audio-unavailable', 'no level is fabricated when audio failed');
});

test('practice recommendations shift allocation toward the measured weakness', () => {
  const skills = perSkillEstimates({
    receptive: { level: 'B1', bySkill: { grammar: { asked: 5, pct: 80 }, vocab: { asked: 3, pct: 70 }, reading: { asked: 2, pct: 75 } } },
    listening: { answered: 5, correct: 2, level: 'A2', se: 0.6, range: 'A2–B1', byProbe: {} },
  });
  const { skillNeeds, directives } = practiceRecommendations({ skills, listening: { unavailable: 0 } });
  assert.ok(skillNeeds.listen >= 0.5, `listening-behind raises the listen need (got ${skillNeeds.listen})`);
  assert.ok(directives.some((d) => d.id === 'listening-behind'), 'the directive explains why');
  assert.ok(directives.some((d) => d.id === 'production-lags'), 'production lag is flagged');

  const unmeasured = practiceRecommendations({
    skills: perSkillEstimates({ receptive: { level: 'A2', bySkill: {} }, listening: { unavailable: 2 } }),
    listening: { unavailable: 2 },
  });
  assert.ok(unmeasured.skillNeeds.listen >= 0.4, 'unmeasured listening still gets scheduled evidence');
  assert.ok(unmeasured.directives.some((d) => d.id === 'listening-unmeasured'));
});

test('abilityToLevel stays the shared band mapping (one scale across stages)', () => {
  assert.equal(abilityToLevel(-2), 'A1');
  assert.equal(abilityToLevel(0), 'B1');
});

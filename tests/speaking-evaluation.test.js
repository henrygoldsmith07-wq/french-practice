import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pauseAnalysis,
  vocabularyRichness,
  fluencyScore,
  evaluateFluency,
  combineSpeakingScore,
} from '../src/lib/speakingEvaluation.js';

test('pause analysis normalises to a per-30s rate and voiced share', () => {
  // 60 s attempt, half voiced, 3 pauses → rate 1.5/30s
  const p = pauseAnalysis({ voicedMs: 30000, totalPauseMs: 30000, pauseCount: 3, longestPauseMs: 2500 }, 60000);
  assert.equal(p.voicedRatio, 0.5);
  assert.equal(p.pauseRate, 1.5);
  assert.equal(p.longestPauseMs, 2500);
});

test('vocabulary richness guards tiny input and bands Guiraud index', () => {
  assert.equal(vocabularyRichness('bonjour salut'), null);
  const repetitive = vocabularyRichness('je veux je veux je veux je veux je veux je veux je veux je veux');
  assert.equal(repetitive.level, 'repetitive');
  const varied = vocabularyRichness(
    'hier matin je suis allé au marché acheter des pommes fraîches parce que ma famille adore les tartes maison'
  );
  assert.ok(['developing', 'varied', 'rich'].includes(varied.level), `unexpected band ${varied.level}`);
  assert.ok(varied.guiraud > repetitive.guiraud);
});

test('fluency score is high for steady natural delivery with no stalls', () => {
  const heard = 'le weekend dernier nous sommes restés à la maison parce quil pleuvait beaucoup mais cétait très reposant quand même';
  const score = fluencyScore(
    { wpm: 110, fillers: 0, words: 20, heard },
    { voicedMs: 10500, totalPauseMs: 400, pauseCount: 0, longestPauseMs: 0 },
    11000
  );
  assert.ok(score >= 80, `expected a strong score, got ${score}`);
});

test('fluency punishes stalls, filler spam and machine-gun pace', () => {
  const stalled = evaluateFluency({
    heard: 'euh je euh je sais pas euh comment dire',
    durationMs: 20000,
    wpm: 30,
    fillers: 3,
    words: 8,
    stats: { voicedMs: 5000, totalPauseMs: 14000, pauseCount: 4, longestPauseMs: 6000 },
  });
  const smooth = evaluateFluency({
    heard: 'je ne sais pas trop comment le dire autrement mais je vais essayer de répondre clairement',
    durationMs: 9000,
    wpm: 115,
    fillers: 0,
    words: 16,
    stats: { voicedMs: 8600, totalPauseMs: 300, pauseCount: 0, longestPauseMs: 0 },
  });
  assert.ok(smooth.score > stalled.score + 30, `${smooth.score} vs ${stalled.score}`);
  assert.equal(stalled.pausing.pauseCount, 4);
});

test('fluency returns null when there is nothing to judge', () => {
  assert.equal(fluencyScore({}, {}, 0), null);
  assert.equal(evaluateFluency({ heard: '', durationMs: 500 }).score, null);
});

test('combined speaking score keeps clarity dominant and tolerates missing fluency', () => {
  assert.equal(combineSpeakingScore({ accuracy: 80, fluency: 60 }), 74);
  assert.equal(combineSpeakingScore({ accuracy: 77 }), 77);
  assert.equal(combineSpeakingScore({}), null);
});

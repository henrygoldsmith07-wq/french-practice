import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/PersonalizedLearningPathway.jsx', import.meta.url), 'utf8');

test('pathway urgency is calculated from the mapped gap value', () => {
  assert.match(source, /const gap = s\.targetLevel - s\.currentLevel;/);
  assert.match(source, /urgency: gap > 15 \? 'high' : gap > 10 \? 'medium' : 'low'/);
  assert.doesNotMatch(source, /urgency: s\.gap/);
});

test('pathway recommendations use the freshly derived gaps', () => {
  assert.match(source, /generateRecommendations\(userProfile, gaps, roadmap\)/);
  assert.doesNotMatch(source, /generateRecommendations\(userProfile, skillGaps, roadmap\)/);
});

test('locked pathway units do not offer a continue action', () => {
  assert.match(source, /\{unit\.status !== 'locked' && \(/);
  assert.doesNotMatch(source, /\{!unit\.locked && \(/);
});

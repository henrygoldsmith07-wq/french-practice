import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The system-prompt injection guard, at the call-site level.
//
// groq.js builds many `role: 'system'` prompts. Any learner-authored or
// AI-authored free text interpolated into one is a prompt-injection surface:
// the privileged instruction channel must never contain raw user/ASR/model
// text that could carry "ignore previous instructions…". sanitizeForPrompt
// (aiValidate.js) is the neutraliser; this test enforces that every known
// free-text variable reaching a system prompt is actually wrapped in it.
//
// This is the call-site guarantee the unit test on sanitizeForPrompt cannot
// give: it proves the FUNCTION works, not that the prompt assembly USES it. A
// future edit that drops a sanitizeForPrompt() wrapper fails here, loudly.
//
// The variables below are the free-text surfaces found by auditing every
// `role: 'system'` content in groq.js. Curated content (scenario.title,
// LANG.name, level, LEVEL_NOTES, knownWords, template constants) is NOT free
// text and is intentionally excluded.

const GROQ = join(process.cwd(), 'src', 'lib', 'groq.js');
const src = readFileSync(GROQ, 'utf8');

// Every free-text variable that must be sanitized wherever it is interpolated.
// originalText/retryText = the learner's own utterance; userText/corrections =
// learner text + prior corrections; topic/prompt = learner-chosen subjects;
// recycling due labels = AI-evaluation-derived weakness names.
const FREE_TEXT_VARS = [
  'originalText',
  'retryText',
  'userText',
  'corrections',
  'topic',
  'prompt',
];

test('every free-text variable in a groq system prompt is sanitized', () => {
  const offenders = [];
  for (const varName of FREE_TEXT_VARS) {
    // A sanitized interpolation looks like ${sanitizeForPrompt(varName, N)}.
    const sanitized = new RegExp(`\\$\\{\\s*sanitizeForPrompt\\(\\s*${varName}\\b`);
    // A raw interpolation looks like ${varName} with no sanitizeForPrompt call.
    const raw = new RegExp(`\\$\\{\\s*${varName}\\s*\\}`);
    const sanitizedCount = (src.match(sanitized) || []).length;
    const rawCount = (src.match(raw) || []).length;
    if (rawCount > 0) {
      offenders.push(`${varName}: ${rawCount} raw interpolation(s) in a prompt (sanitized: ${sanitizedCount})`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Free text must never reach a system prompt raw — wrap each interpolation ` +
    `in sanitizeForPrompt (the privileged channel must not carry learner/ASR/model text):\n  ${offenders.join('\n  ')}`,
  );
});

test('the recycling.due labels reaching learningPlanLine are sanitized', () => {
  // learningPlanLine interpolates due weakness labels (AI-evaluation-derived)
  // into the conversation system prompt. The due-building chain must route each
  // label through sanitizeForPrompt before the join (matched on the same line).
  const dueLine = src.split('\n').find((l) => l.includes('recycling.due') && l.includes('const due'));
  assert.ok(dueLine, 'the due-label line exists');
  assert.match(
    dueLine,
    /sanitizeForPrompt/,
    'the due-label mapping must pass through sanitizeForPrompt -- they are ' +
    'AI-evaluation text folded into the system prompt',
  );
});

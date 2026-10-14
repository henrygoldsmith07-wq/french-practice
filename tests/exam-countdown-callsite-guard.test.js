import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The exam-countdown board-weight footgun, guarded.
//
// Three times this session (#17, #19, and the original omission) a call site of
// examCountdown forgot to forward the learner's board oracy weight, so the
// dashboard brief and the live session disagreed about an oracy-heavy paper:
// the preview leaned on speaking while the session (or vice versa) ignored the
// board. Root cause: the board scaling is an OPTIONAL parameter, and nothing
// forced a new call site to pass it.
//
// The API now leads with a plain `speakingWeight` number and a shared
// resolveSpeakingWeight(settings) helper precisely so it is hard to forget. But
// "hard to forget" is not "impossible", so this test makes it IMPOSSIBLE to
// forget silently: every examCountdown( call site in src/ must forward the
// board weight — via `speakingWeight` or the legacy `speakingWeightOf` lookup.
// A new call site that omits it fails here, loudly, at review time.

const SRC = join(process.cwd(), 'src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('every examCountdown call site forwards the board weight', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    // Strip line comments so a commented-out call (e.g. an explanatory mention)
    // is not scanned as a live call site.
    const code = text.replace(/\/\/[^\n]*/g, '');
    const re = /examCountdown\(/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      // The definition itself (in exams/findings.js) is not a call site.
      if (/export\s+function\s+examCountdown\s*\($/.test(code.slice(Math.max(0, m.index - 30), m.index + 'examCountdown('.length))) continue;
      const start = m.index + m[0].length;
      // Walk to the matching close paren (handles nested parens in the args).
      let depth = 1;
      let i = start;
      while (i < code.length && depth > 0) {
        if (code[i] === '(') depth += 1;
        else if (code[i] === ')') depth -= 1;
        i += 1;
      }
      const args = code.slice(start, i - 1);
      // Accepts both `speakingWeight: x` / `speakingWeightOf: x` AND the ES6
      // shorthand `speakingWeight,` / `speakingWeightOf,` (ExamSetup passes the
      // lookup by name).
      const forwardsBoard = /speakingWeight\s*[:,]/.test(args) || /speakingWeightOf\s*[:,]/.test(args);
      if (!forwardsBoard) {
        const rel = file.slice(process.cwd().length + 1);
        offenders.push(`${rel}: examCountdown(${args.trim().replace(/\s+/g, ' ').slice(0, 60)}…)`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `examCountdown call sites must forward the board weight (speakingWeight or speakingWeightOf) — ` +
    `the #17/#19 divergence was exactly this omission:\n  ${offenders.join('\n  ')}`,
  );
});

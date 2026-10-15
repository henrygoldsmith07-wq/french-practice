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
//
// THE FIRST VERSION OF THIS GUARD CHECKED THE KEY ONLY. That was not enough:
// `examCountdown(date, { now, speakingWeight: weight })` satisfied it while
// `weight` was null, so a call site could pass the guard and still drop the
// board — exactly how #17 and #19 read in review, correct-looking call with an
// absent value. This version parses the source and also inspects the VALUE.
//
// WHAT STATIC ANALYSIS CAN AND CANNOT SEE (stated honestly):
//   CAUGHT  — key omitted; literal null/undefined/0; an identifier declared with
//             a null/undefined literal (`const w = null`).
//   NOT CAUGHT — a value whose nullishness depends on runtime input, e.g.
//             `Number.isFinite(w) && w > 0 ? w : null`. That ternary is
//             undecidable statically, and a guard that cannot decide must not
//             guess: rejecting it would block the CORRECT current call site in
//             todayPlan.js, and the ordinary case it protects (a null value
//             reaching examCountdown) is already handled inside
//             examCountdown itself, which treats a null/0 weight as "no board".
//
// So the real defence is layered, not one test: examCountdown must never invent
// urgency from a nullish weight (unit-tested), the call-site guard catches the
// omissions static analysis CAN see (this file), and the cross-planner agreement
// test catches any divergence that survives both (exam-weighting-live-session).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

// Lazy: acorn is a devDependency, and the guard must not hard-fail if a minimal
// checkout has not installed it. In that case the test is skipped loudly rather
// than silently passing.
const { parse } = await import('acorn').catch(() => ({ parse: null }));

/**
 * Names declared with a literal null/undefined initialiser anywhere in this
 * module. `const w = null; ... examCountdown(d, { speakingWeight: w })` names
 * the key but drops the board, and only the declaration proves it — the call
 * site itself looks identical to a good one.
 *
 * Deliberately conservative: it never inspects assignments or reassignments, so
 * a variable that is null at declaration and re-assigned later is NOT flagged.
 * False negatives are acceptable here (the guard errs toward letting real code
 * through); false positives would block legitimate call sites.
 */
function collectNullishNames(ast) {
  const names = new Set();
  (function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' &&
        node.id && node.id.type === 'Identifier' &&
        node.init && node.init.type === 'Literal' &&
        (node.init.value === null || node.init.value === undefined)) {
      names.add(node.id.name);
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object' && child.type) visit(child);
    }
  })(ast);
  return names;
}

test('every examCountdown call site forwards a REAL board weight', async (t) => {
  if (!parse) {
    t.skip('acorn unavailable — install devDependencies to run the call-site guard');
    return;
  }

  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(process.cwd().length + 1);
    let ast;
    try {
      ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true });
    } catch {
      // A file acorn cannot parse is not this guard's problem; other checks own
      // syntax. Skipping avoids a false alarm on a syntax variant.
      continue;
    }

    // Every CallExpression whose callee is named examCountdown.
    const calls = [];
    (function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CallExpression' &&
          node.callee && node.callee.type === 'Identifier' && node.callee.name === 'examCountdown') {
        calls.push(node);
      }
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === 'object' && child.type) visit(child);
      }
    })(ast);

    for (const call of calls) {
      // The definition itself is not a call site.
      const isDefinition = text.slice(0, call.start).includes('export function examCountdown');
      if (isDefinition) continue;

      const options = call.arguments[1];
      if (!options || options.type !== 'ObjectExpression') {
        offenders.push(`${rel}: examCountdown call with no options object`);
        continue;
      }

      const props = options.properties
        .filter((p) => p.type === 'Property' && p.key && (p.key.name || p.key.value));

      const boardProp = props.find((p) => {
        const name = p.key.name || p.key.value;
        return name === 'speakingWeight' || name === 'speakingWeightOf';
      });

      const describe = () => {
        const args = call.arguments.map((a) => a.type === 'Identifier' ? a.name : a.type);
        return `examCountdown(${args.join(', ')})`;
      };

      if (!boardProp) {
        offenders.push(`${rel}: ${describe()} omits the board weight entirely`);
        continue;
      }

      // The key is present — now check the VALUE. Any of these drops the board
      // in practice while naming the key, which is precisely how #17 and #19
      // read in review: correct-looking call, absent value.
      const v = boardProp.value;
      const nullLocals = collectNullishNames(ast);
      const isLiteralNullish = v.type === 'Literal' && (v.value === null || v.value === undefined);
      const isLiterallyZero = v.type === 'Literal' && v.value === 0;
      const referencesNullLocal = v.type === 'Identifier' && nullLocals.has(v.name);

      if (isLiteralNullish || isLiterallyZero || referencesNullLocal) {
        const what = isLiterallyZero ? '0' : 'nullish';
        offenders.push(
          `${rel}: ${describe()} names ${boardProp.key.name} but passes ${what} — the board would be dropped`,
        );
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `examCountdown call sites must forward a REAL board weight (speakingWeight or\n` +
    `speakingWeightOf), and a literal null/0 does not count — the #17/#19 divergence\n` +
    `was exactly this omission:\n  ${offenders.join('\n  ')}`,
  );
});

test('the guard rejects a named-but-nullish weight, not just a missing one', () => {
  // The regression this guard exists to prevent. The first version accepted
  // `speakingWeight: x` unconditionally, so a call site with `x === null` passed
  // while dropping the board. Assert the actual detection contract from the
  // module header: omitted, literal null/0, and a reference to a null-declared
  // local are all flagged, and nothing nullish is accepted as real.
  if (!parse) return;
  const src = `
    const w = null;
    const good = 0.3;
    const a = examCountdown(date, { now });
    const b = examCountdown(date, { now, speakingWeight: w });
    const c = examCountdown(date, { now, speakingWeightOf: w });
    const d = examCountdown(date, { now, speakingWeight: null });
    const e = examCountdown(date, { now, speakingWeight: 0 });
    const f = examCountdown(date, { now, speakingWeight: good });
    const g = examCountdown(date, { now, speakingWeight: Number.isFinite(w) && w > 0 ? w : null });
  `;
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const nullLocals = collectNullishNames(ast);

  const calls = [];
  (function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' &&
        node.callee && node.callee.type === 'Identifier' && node.callee.name === 'examCountdown') calls.push(node);
    for (const k of Object.keys(node)) {
      const c = node[k];
      if (Array.isArray(c)) c.forEach(visit);
      else if (c && typeof c === 'object' && c.type) visit(c);
    }
  })(ast);

  const verdicts = calls.map((call) => {
    const options = call.arguments[1];
    const props = options && options.type === 'ObjectExpression' ? options.properties : [];
    const boardProp = props.find((p) => {
      const n = p.key.name || p.key.value;
      return n === 'speakingWeight' || n === 'speakingWeightOf';
    });
    if (!boardProp) return 'omitted';
    const v = boardProp.value;
    if (v.type === 'Literal' && (v.value === null || v.value === 0)) return 'literal-nullish';
    if (v.type === 'Identifier' && nullLocals.has(v.name)) return 'null-local';
    return 'accepted';
  });

  // Omitted, the null and 0 literals, and the two references to the null-declared
  // local are all caught.
  assert.equal(verdicts.filter((x) => x === 'omitted').length, 1, 'the omitted weight is flagged');
  assert.equal(verdicts.filter((x) => x === 'literal-nullish').length, 2, 'null and 0 literals are flagged');
  assert.equal(verdicts.filter((x) => x === 'null-local').length, 2, 'a reference to a null local is flagged');

  // A genuine weight and the runtime-decidable ternary are both accepted — the
  // ternary is TODAYPLAN'S REAL CALL SITE, so flagging it would make the guard
  // reject correct code. examCountdown itself treats its null branch as "no
  // board", which is where that case is handled.
  const accepted = calls.filter((call, i) => verdicts[i] === 'accepted');
  assert.equal(accepted.length, 2, 'a genuine weight and a guarded ternary are accepted, not flagged');
});

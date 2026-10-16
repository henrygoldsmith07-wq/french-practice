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
// WHY THIS PARSES INSTEAD OF PATTERN-MATCHING
//     The first version matched the exact text `${varName}`. That only detects a
//     bare interpolation, so `${topic.trim()}`, `${t.userText}`, `${topic || ''}`
//     and `${corrections.join('; ')}` all escaped it — measured at 5 of the 7
//     raw forms. Any of those could have shipped a raw learner string into the
//     privileged channel with the guard still green. This version walks the AST,
//     so the SHAPE of the expression no longer matters: what matters is whether
//     a free-text identifier's VALUE can reach the output without passing
//     through sanitizeForPrompt.
//
// WHAT IT RESOLVES, AND WHY THAT MATTERS
//     Two system prompts pass their content indirectly — `content: system`
//     (a destructured function parameter, supplied by the caller) and
//     `content: TUTOR_SYSTEM(level, learner)` (a call). A scan that only looked
//     at inline template literals would silently skip both, so this resolves
//     each to the template(s) it can reach and scans those too. Content that
//     cannot be resolved is reported as a GAP, never passed — skipping
//     unresolvable content would be the same class of hole this guard closes.
//
// WHAT IT DELIBERATELY DOES NOT FLAG
//     Curated content (scenario titles, LANG.name, CEFR level, LEVEL_NOTES,
//     knownWords, template constants) is not free text. Learner text in a
//     `role: 'user'` message is normal and expected — the whole point of the
//     system/user split — so only system-role content is scanned. And a
//     truthiness TEST (`${prompt ? … : ''}`) never contributes its value to the
//     string, so the tested identifier is not an offender; flagging it would
//     block correct code.

const GROQ = join(process.cwd(), 'src', 'lib', 'groq.js');
const src = readFileSync(GROQ, 'utf8');

// Every free-text identifier whose VALUE must be sanitized wherever it reaches
// a system prompt. originalText/retryText = the learner's own utterance;
// userText/corrections = learner text + prior corrections; topic/prompt =
// learner-chosen subjects. The recycling-due labels (AI-evaluation-derived) are
// covered by the second test below, because they arrive by a different route.
const FREE_TEXT_VARS = new Set([
  'originalText',
  'retryText',
  'userText',
  'corrections',
  'topic',
  'prompt',
]);

// Lazy: acorn is a devDependency. If a minimal checkout has not installed it the
// test is SKIPPED loudly rather than silently passing — a security guard that
// quietly does nothing is worse than no guard.
const { parse } = await import('acorn').catch(() => ({ parse: null }));

/** Depth-first walk over every node in the tree. */
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  fn(node);
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => walk(c, fn));
    else if (child && typeof child === 'object' && child.type) walk(child, fn);
  }
}

/**
 * Free-text identifiers whose VALUE can reach a template's output without
 * passing through sanitizeForPrompt.
 *
 * A template is clean when every free-text identifier it reaches appears only
 * inside a sanitizeForPrompt(...) call, or only in a position whose value never
 * enters the string.
 */
function rawFindings(template) {
  const findings = [];

  for (const expr of template.expressions) {
    // Spans covered by a sanitizeForPrompt(...) call.
    const safeSpans = [];
    walk(expr, (n) => {
      if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier' &&
          n.callee.name === 'sanitizeForPrompt') {
        safeSpans.push([n.start, n.end]);
      }
    });
    const insideSafe = (start) => safeSpans.some(([s, e]) => start >= s && start < e);
    const report = (node) => {
      if (FREE_TEXT_VARS.has(node.name) && !insideSafe(node.start)) {
        findings.push({ name: node.name, start: node.start });
      }
    };

    // `output` = this subexpression's value can reach the rendered string.
    // Positions that cannot contribute a value are visited with output=false.
    (function visit(node, output) {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'Identifier') {
        if (output) report(node);
        return;
      }

      if (node.type === 'ConditionalExpression') {
        // `${prompt ? '…' : ''}` — the TEST decides which arm is used; its own
        // value never enters the string.
        visit(node.test, false);
        visit(node.consequent, output);
        visit(node.alternate, output);
        return;
      }

      if (node.type === 'MemberExpression') {
        visit(node.object, output);
        if (node.computed) {
          visit(node.property, output); // a[b] can leak b's value
        } else if (output) {
          // `${t.userText}`: the object is a container, but the property NAMES the
          // free-text field, so its value is exactly the learner text at issue.
          if (node.property && node.property.type === 'Identifier') report(node.property);
        }
        return;
      }

      if (node.type === 'Property') {
        if (node.computed) visit(node.key, output);
        visit(node.value, output);
        return;
      }

      if (node.type === 'VariableDeclarator') {
        // `userText` in `const { userText } = turn` declares a binding; the
        // identifier here is the NAME, not an interpolated value.
        visit(node.init, output);
        return;
      }

      if (node.type === 'CallExpression') {
        // Traverse the callee rather than skipping it: for `topic.trim()` the
        // callee is a MemberExpression whose OBJECT is the leaking free text.
        visit(node.callee, output);
        for (const arg of node.arguments) visit(arg, output);
        return;
      }

      for (const key of Object.keys(node)) {
        if (key === 'start' || key === 'end' || key === 'type') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach((c) => visit(c, output));
        else if (child && typeof child === 'object' && child.type) visit(child, output);
      }
    })(expr, true);
  }

  return findings;
}

/**
 * Every TemplateLiteral reachable from a `content` value.
 *
 * - TemplateLiteral: itself.
 * - Identifier: templates assigned to that name in the module; if the name is a
 *   parameter of `enclosingFn` (including destructured), the templates the
 *   CALLERS pass at that position.
 * - CallExpression with an Identifier callee: templates inside the declaration
 *   of that name.
 * - Anything else: none — the caller reports it as a GAP.
 */
function templatesFor(value, ast, enclosingFn) {
  if (value.type === 'TemplateLiteral') return [value];
  const out = [];

  if (value.type === 'Identifier') {
    walk(ast, (n) => {
      if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier' &&
          n.id.name === value.name && n.init) {
        walk(n.init, (m) => { if (m.type === 'TemplateLiteral') out.push(m); });
      }
    });
    if (out.length) return out;

    if (!enclosingFn || !enclosingFn.id) return out;

    // Where does `value` sit in the enclosing function's signature? Handles both
    // `function f(a, { system })` and `function f({ system, prompt })` — the
    // destructured form is what groq.js uses.
    let paramIndex = -1;
    enclosingFn.params.forEach((p, i) => {
      if (paramIndex !== -1) return;
      if (p.type === 'Identifier' && p.name === value.name) paramIndex = i;
      if (p.type === 'ObjectPattern') {
        const hit = (p.properties || []).some(
          (pr) => pr.type === 'Property' && (pr.key.name || pr.key.value) === value.name,
        );
        if (hit) paramIndex = i;
      }
    });
    if (paramIndex === -1) return out;

    walk(ast, (n) => {
      if (n.type !== 'CallExpression' || !n.callee || n.callee.type !== 'Identifier') return;
      if (n.callee.name !== enclosingFn.id.name) return;
      const arg = n.arguments[paramIndex];
      if (!arg || arg.type !== 'ObjectExpression') return;
      const prop = (arg.properties || []).find(
        (p) => p.type === 'Property' && (p.key.name || p.key.value) === value.name,
      );
      if (!prop) return;
      walk(prop.value, (m) => { if (m.type === 'TemplateLiteral') out.push(m); });
    });
    return out;
  }

  if (value.type === 'CallExpression' && value.callee && value.callee.type === 'Identifier') {
    const fnName = value.callee.name;
    walk(ast, (n) => {
      // `function TUTOR_SYSTEM(...) { … }`
      if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') &&
          n.id && n.id.name === fnName && n.body) {
        walk(n.body, (m) => { if (m.type === 'TemplateLiteral') out.push(m); });
      }
      // `const TUTOR_SYSTEM = (level, learner) => \`…\``
      if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier' &&
          n.id.name === fnName && n.init && n.init.body) {
        walk(n.init.body, (m) => { if (m.type === 'TemplateLiteral') out.push(m); });
      }
    });
  }

  return out;
}

test('every free-text identifier reaching a system prompt is sanitized', async (t) => {
  if (!parse) {
    t.skip('acorn unavailable — install devDependencies to run the prompt-injection guard');
    return;
  }

  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });

  // Every `role: 'system'` object, its content value, and the function that
  // encloses it (needed to resolve a content that is a caller-supplied parameter).
  const systems = [];
  (function visit(node, enclosingFn) {
    if (!node || typeof node !== 'object') return;
    let fn = enclosingFn;
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
        node.id && node.id.name) {
      fn = node;
    }
    if (node.type === 'ObjectExpression') {
      const props = node.properties || [];
      const role = props.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'role');
      if (role && role.value.type === 'Literal' && role.value.value === 'system') {
        const content = props.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'content');
        systems.push({ value: content ? content.value : null, enclosingFn: fn });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c, fn));
      else if (child && typeof child === 'object' && child.type) visit(child, fn);
    }
  })(ast, null);

  assert.ok(systems.length >= 15, `expected to find the system prompts, found ${systems.length}`);

  const offenders = [];
  let scannedTemplates = 0;

  for (const { value, enclosingFn } of systems) {
    if (!value) {
      offenders.push('a role:system object has no resolvable content');
      continue;
    }
    const templates = templatesFor(value, ast, enclosingFn);
    if (templates.length === 0) {
      // A HOLE, not a pass: the guard cannot prove this prompt is safe, so it
      // must say so rather than skip quietly.
      const line = src.slice(0, value.start).split('\n').length;
      offenders.push(`line ${line}: content (${value.type}) could not be resolved to any template — ` +
        'the guard cannot verify it is sanitized');
      continue;
    }
    for (const template of templates) {
      scannedTemplates++;
      for (const finding of rawFindings(template)) {
        const line = src.slice(0, template.start + finding.start).split('\n').length;
        offenders.push(`line ~${line}: raw ${finding.name} in a system prompt (wrap it in sanitizeForPrompt)`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'Free text must never reach a system prompt raw — wrap each interpolation ' +
    `in sanitizeForPrompt (the privileged channel must not carry learner/ASR/model text):\n  ${offenders.join('\n  ')}`,
  );

  // The guard must actually have looked at something: a scan that resolves no
  // templates would pass vacuously.
  assert.ok(scannedTemplates >= 15, `expected to scan the system templates, scanned ${scannedTemplates}`);
});

test('the guard fails when a raw free-text interpolation is introduced', async () => {
  // The proof that matters: a violation the old regex could not see must make
  // this guard RED. Without it, a green guard proves nothing.
  //
  // Uses a temporary copy of groq.js with sanitizeForPrompt dropped from the
  // exercise-prompt interpolation — exactly the edit a future contributor might
  // make, and exactly the shape (`${topic.trim()}`) the old regex accepted.
  if (!parse) return;

  // An in-memory copy of groq.js with sanitizeForPrompt dropped from the
  // exercise-prompt interpolation — exactly the edit a future contributor might
  // make, and exactly the shape (`${topic.trim()}`) the old regex accepted.
  const patched = src.replace(/\$\{sanitizeForPrompt\(topic, 120\)\}/, '${topic.trim()}');
  assert.notEqual(patched, src,
    'the sabotage pattern must exist in groq.js for this test to mean anything');

  const ast = parse(patched, { ecmaVersion: 'latest', sourceType: 'module' });
  const offenders = [];
  (function visit(node, enclosingFn) {
    if (!node || typeof node !== 'object') return;
    let fn = enclosingFn;
    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
        node.id && node.id.name) fn = node;
    if (node.type === 'ObjectExpression') {
      const props = node.properties || [];
      const role = props.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'role');
      if (role && role.value.type === 'Literal' && role.value.value === 'system') {
        const content = props.find((p) => p.type === 'Property' && (p.key.name || p.key.value) === 'content');
        if (content) {
          for (const template of templatesFor(content.value, ast, fn)) {
            for (const f of rawFindings(template)) offenders.push(f.name);
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c, fn));
      else if (child && typeof child === 'object' && child.type) visit(child, fn);
    }
  })(ast, null);

  assert.ok(offenders.includes('topic'),
    `the guard must catch a raw '${'${topic.trim()}'}' — it caught: ${JSON.stringify(offenders)}`);
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
    'AI-evaluation-derived text folded into the system prompt',
  );
});

test('the guard detects the interpolation shapes the old regex missed', async () => {
  // Regression proof for the rewrite. Each case below is a RAW free-text
  // interpolation that the previous `${var}`-only regex failed to flag, so each
  // must now be reported. If any is missed, the guard has regressed to the
  // pattern-matching hole it was rewritten to close.
  if (!parse) return;

  const rawCases = [
    ['${topic.trim()}', 'method call'],
    ['${t.userText}', 'member expression'],
    ["${topic || 'none'}", 'logical fallback'],
    ['${prompt.slice(0, 50)}', 'slice call'],
    ["${corrections.join('; ')}", 'join call'],
    ['${topic}', 'bare — the ONE shape the old guard caught'],
  ];

  for (const [expr, label] of rawCases) {
    const snippet = 'const s = { role: "system", content: `prefix ' + expr + ' suffix` };';
    const ast = parse(snippet, { ecmaVersion: 'latest', sourceType: 'module' });
    let template = null;
    walk(ast, (n) => { if (n.type === 'TemplateLiteral') template = n; });
    assert.ok(rawFindings(template).length > 0,
      `the guard must flag a raw ${label} (${expr}) — the old regex missed exactly this shape`);
  }

  // Negative controls — none of these may be flagged, or the guard would block
  // correct code and be disabled in frustration.
  const safeCases = [
    ['${sanitizeForPrompt(topic, 120)}', 'sanitized'],
    ['${prompt ? `x ${sanitizeForPrompt(prompt, 200)}` : \'\'}', 'sanitized inside a ternary'],
    ['${prompt ? "x" : ""}', 'a bare truthiness TEST never interpolates its value'],
  ];
  for (const [expr, label] of safeCases) {
    const snippet = 'const s = { role: "system", content: `prefix ' + expr + ' suffix` };';
    const ast = parse(snippet, { ecmaVersion: 'latest', sourceType: 'module' });
    let template = null;
    walk(ast, (n) => { if (n.type === 'TemplateLiteral') template = n; });
    assert.deepEqual(rawFindings(template), [],
      `the guard must NOT flag ${label} (${expr})`);
  }
});

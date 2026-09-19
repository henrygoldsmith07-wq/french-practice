/**
 * Performance / size budget check for Le Studio.
 * Runs after `vite build`. Exits 1 if any single JS chunk exceeds the
 * per-chunk budget, the entry chunk exceeds its dedicated budget, or total
 * shipped JS exceeds the total budget — a slow first load is a regression,
 * not a warning.
 *
 * A missing or empty dist is a HARD FAILURE, not a skip: the whole point of
 * this gate is to notice when the build stops producing measurable output.
 */
import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

const DIST = 'dist';
const BUDGET_KB = 600; // max size of any single JS chunk (raw)
// The entry chunk is the first-load critical path — it gets its own, tighter
// budget so an accidental import cannot quietly grow it (today ~291 KB).
const ENTRY_BUDGET_KB = 560;
// First-load JS = the entry chunk PLUS every chunk it statically imports
// (today: the vendor chunk). This is what the browser must download before
// the app can boot, so it is the honest number to gate. Set from the current
// build (~433 KB) with a little headroom; the original target was <450 KB.
const FIRSTLOAD_BUDGET_KB = 450;
// Total shipped JS: the PWA caches everything offline, so all three
// languages' content legitimately ships once. Set from the current build with
// headroom; the first-load budget is the boot-time guard.
const TOTAL_BUDGET_KB = 1800;

const fail = (msg) => { console.error(msg); process.exit(1); };

let files;
try {
  files = readdirSync(DIST, { recursive: true });
} catch (e) {
  fail(`✗ ${DIST}/ is unreadable (${e.message}) — run "vite build" before check-performance.`);
}
if (!files || !files.length) fail(`✗ ${DIST}/ is empty — run "vite build" before check-performance.`);

const chunks = [];
const rawTexts = new Map(); // chunk name -> source text (for the first-load closure)
let total = 0;
for (const f of files) {
  const p = join(DIST, String(f));
  try {
    const s = statSync(p);
    if (s.isFile() && /\.js$/.test(p)) {
      const kb = Math.round(s.size / 1024);
      total += kb;
      chunks.push([kb, String(f)]);
      if (kb <= 2048) {
        try { rawTexts.set(String(f), readFileSync(p, 'utf8')); } catch { /* vanished mid-read */ }
      }
    }
  } catch { /* vanished mid-read — ignore */ }
}
if (!chunks.length) fail(`✗ No JS chunks found in ${DIST}/ — the build output changed or is empty.`);

chunks.sort((a, b) => b[0] - a[0]);
const top = chunks.slice(0, 5).map(([kb, name]) => `  ${String(kb).padStart(6)} KB  ${name}`).join('\n');
console.log(`Performance: total JS ${total} KB across ${chunks.length} chunks (budgets ${ENTRY_BUDGET_KB} entry / ${BUDGET_KB} per chunk / ${TOTAL_BUDGET_KB} total)\nTop chunks:\n${top}`);

let failed = false;
const entry = chunks.find(([, name]) => /(^|\/|\\)index-[^/\\]*\.js$/.test(name));
if (entry && entry[0] > ENTRY_BUDGET_KB) {
  console.error(`✗ Entry chunk ${entry[1]} is ${entry[0]} KB, over the ${ENTRY_BUDGET_KB} KB entry budget. Move content out of the entry graph (see src/lib/vocabAsync.js).`);
  failed = true;
}

// ---- first-load closure gate ------------------------------------------------
// The entry chunk statically imports its runtime dependencies (the vendor
// chunk today). Anything reachable via STATIC import must download before the
// app boots — dynamic `import()` chunks do NOT count. Walk the closure from
// the built bundle's import statements so a future accidental static import
// of a heavy module fails this gate instead of quietly slowing first paint.
if (entry) {
  const byName = new Map(chunks.map(([kb, name]) => [name, kb]));
  const closure = new Set([entry[1]]);
  const queue = [entry[1]];
  while (queue.length) {
    const cur = queue.pop();
    const text = rawTexts.get(cur);
    if (!text) continue;
    for (const m of text.matchAll(/import[\s(]?[\s\S]{0,400}?from\s*"(\.\/|\.\.\/)*?(assets\/)?([\w.-]+\.js)"/g)) {
      const dep = [...byName.keys()].find((n) => n.endsWith(m[3]) || n === m[3]);
      if (dep && !closure.has(dep)) { closure.add(dep); queue.push(dep); }
    }
  }
  const firstLoad = [...closure].reduce((sum, n) => sum + (byName.get(n) || 0), 0);
  const parts = [...closure].map((n) => `${n} (${byName.get(n) || '?'} KB)`).join(' + ');
  console.log(`First-load JS: ${firstLoad} KB = ${parts} (budget ${FIRSTLOAD_BUDGET_KB})`);
  if (firstLoad > FIRSTLOAD_BUDGET_KB) {
    console.error(`✗ First-load JS is ${firstLoad} KB, over the ${FIRSTLOAD_BUDGET_KB} KB budget (${parts}). The entry graph must stay lazy: move heavy content/research modules behind dynamic import().`);
    failed = true;
  }
}
const over = chunks.filter(([kb]) => kb > BUDGET_KB);
if (over.length) {
  console.error(`✗ Largest JS chunk ${over[0][1]} is ${over[0][0]} KB, over the ${BUDGET_KB} KB per-chunk budget. Split lazy chunks / move data out of the entry graph (see src/lib/vocabAsync.js).`);
  failed = true;
}
if (total > TOTAL_BUDGET_KB) {
  console.error(`✗ Total JS ${total} KB exceeds the ${TOTAL_BUDGET_KB} KB budget.`);
  failed = true;
}
if (failed) process.exit(1);

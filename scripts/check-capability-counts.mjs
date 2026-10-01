/**
 * Capability-count guard for the PUBLIC docs (index.html, public/llms.txt).
 *
 * These counts are capabilities, not copy: how many scenarios, vocabulary
 * entries or grammar topics the app actually ships. They drifted repeatedly
 * because they were hand-written (index.html claimed 40 scenarios and 42
 * flashcard packs while llms.txt claimed 14 and 18, and both named SM-2 as
 * the scheduler long after it became FSRS).
 *
 * The numbers below are the single source of truth. Both docs are rewritten
 * from them via the markers below, and any mismatch FAILS the content lint,
 * so a count can never quietly go stale again. Scheduler naming is checked the
 * same way, because an obsolete algorithm name in public copy is a claim the
 * product cannot back.
 */
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const [{ GRAMMAR_TOPICS }, { LISTENING_TRACKS }, { READING_TEXTS }, vocab, { CURRICULUM_PACKS }] = await Promise.all([
  load('src/lib/grammar.js'),
  load('src/lib/listening.js'),
  load('src/lib/reading.js'),
  load('src/lib/vocab.js'),
  load('src/lib/vocab.js'),
]);

// The authoritative counts.
const counts = {
  vocabEntries: (await vocab.allEntriesAsync()).length,
  vocabPacks: CURRICULUM_PACKS.length,
  grammarTopics: (GRAMMAR_TOPICS || []).length,
  listeningTracks: (LISTENING_TRACKS || []).length,
  readingTexts: (READING_TEXTS || []).length,
};

// Markers the docs use so the values are injected, not transcribed.
//   <!-- counts:vocabEntries -->1<!-- /counts:vocabEntries -->
// Rewriting is done by `npm run sync:docs`; the lint only CHECKS them.
const MARKER = /<!--\s*counts:([a-zA-Z]+)\s*-->[^<]*<!--\s*\/counts:\1\s*-->/g;

// Obsolete scheduler name: FSRS replaced SM-2. It must not appear as a live
// claim anywhere in the public copy (it may only be named as legacy history).
const OBSOLETE_SCHEDULER = /SM-?2(?!\s*(?:data|import|histor|legacy))/i;

const docs = ['index.html', 'public/llms.txt', 'README.md'];
const errors = [];

for (const rel of docs) {
  const src = read(rel);
  // Every marker must already hold the current value.
  for (const [, name] of src.matchAll(MARKER)) {
    if (!(name in counts)) { errors.push(`${rel}: unknown count marker "${name}"`); continue; }
    const m = src.match(new RegExp(`<!--\\s*counts:${name}\\s*-->([^<]*)<!--\\s*/counts:${name}\\s*-->`));
    if (!m) continue;
    // Prose may format the number with a thousands separator, so compare digits.
    const digits = (s) => String(s).replace(/[^0-9]/g, '');
    if (digits(m[1]) !== digits(counts[name])) {
      errors.push(
        `${rel}: ${name} says "${m[1].trim()}" but the app ships ${counts[name]} \u2014 run \`npm run sync:docs\``,
      );
    }
  }
  if (OBSOLETE_SCHEDULER.test(src)) {
    errors.push(`${rel}: mentions SM-2 as if it were the scheduler; the app schedules with FSRS`);
  }
}

if (errors.length) {
  console.error('Public capability counts are stale:');
  errors.forEach((e) => console.error('  \u2717', e));
  process.exit(1);
}
console.log(
  `Capability counts OK \u2014 vocab ${counts.vocabEntries} entries / ${counts.vocabPacks} packs, `
    + `${counts.grammarTopics} grammar topics, ${counts.listeningTracks} listening tracks.`,
);

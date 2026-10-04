// Follow-up checks — the check the recovery loop OWES, made concrete.
//
// The learner model can say "this needs a fresh-context check" and "this one
// needs re-testing after a delay", but a promise is not evidence. Until
// something actually administers that check, the last two links of the loop
// (transfer → delayed retest) never close: the debt sits in storage forever
// and the session only mentions it.
//
// This module turns ONE due check into ONE concrete task a session can really
// run, offline and deterministically. It owns POLICY, not content:
//   · which task suits which weakness (a fresh item lane, the word used in a
//     new sentence, a different recording);
//   · what a pass would prove — and what it would not;
//   · when no honest task exists: it returns null instead of inventing one.
//
// Freshness is the point. A check that replays what was just drilled is
// repetition, not transfer, so it never claims held-out credit.
//
// Deterministic: the same due check on the same local day always yields the
// same task, so a mid-session reload cannot silently change the exercise.

import { authoredLanesFor } from './todayCapabilities.js';
import { assessTransferNovelty } from './speakingTransfer.js';
import { localDayIndex } from './localDay.js';

export const FOLLOW_UP_KINDS = Object.freeze({
  AUTHORED: 'authored-transfer',
  PRODUCTION: 'production-transfer',
  LISTENING: 'listening-transfer',
});

const asText = (value) => String(value || '').trim();

// Strip accents via the Unicode mark property so the source stays ASCII:
// «cœur» and «coeur» must compare equal on both sides of the check.
const normalise = (text) => asText(text)
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Rotate a lane by the local day so consecutive checks do not hand back the
// same first item, while staying stable for the whole day.
function rotate(items, offset = 0) {
  if (!items.length) return [];
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/**
 * The task for one due check, or null when nothing honest can be built.
 *
 * @param {{type?: 'transfer'|'delayed', target?: {id?: string, skill?: string, key?: string, label?: string}}} due
 * @param {{tracks?: Array, sessionTrackId?: string|null, dayIndex?: number, limit?: number}} options
 */
export function followUpTask(due, options = {}) {
  const target = due?.target;
  if (!target) return null;
  const type = due.type === 'delayed' ? 'delayed' : 'transfer';
  const skill = asText(target.skill).toLowerCase();
  const key = asText(target.key);
  const label = asText(target.label) || key;
  const dayIndex = Number.isFinite(Number(options.dayIndex)) ? Number(options.dayIndex) : localDayIndex();
  const limit = Math.max(1, Math.min(4, Number(options.limit) || 3));
  const targetId = target.id || `${skill}:${key}`;

  // ── Authored grammar / writing: the library's SECOND lane ───────────────
  // Every authored topic ships `drills` (what the repair drill shows) and
  // `quiz` (the same rule, different sentences — never shown by the repair
  // path). Drawing from the second lane is transfer in the plain sense: the
  // learner meets the rule again without meeting the sentence again.
  if (skill === 'grammar' || skill === 'writing') {
    const lanes = authoredLanesFor(label || key);
    const fresh = lanes?.quiz || [];
    const useFresh = fresh.length > 0;
    // A transfer check MUST be unseen material. A delayed retest is recall of
    // material already met, so once the fresh lane is spent it may honestly
    // fall back to the taught lane — for a delayed check only.
    const pool = useFresh ? fresh : (type === 'delayed' ? (lanes?.drills || []) : []);
    if (!pool.length) return null;
    const exercises = rotate(pool, dayIndex).slice(0, Math.min(limit, pool.length));
    return {
      kind: FOLLOW_UP_KINDS.AUTHORED,
      type,
      targetId,
      skill,
      key,
      label: lanes.title || label,
      exercises,
      // Structurally unseen: the repair drill only ever draws the `drills`
      // lane, so a `quiz` item cannot have been met there.
      heldOut: useFresh,
      encounterId: `followup:${targetId}:${type}:${dayIndex}:${exercises.length}`,
      prompt: type === 'delayed'
        ? 'The same rule, later, on its own.'
        : 'The same rule, in different sentences.',
    };
  }

  // ── Vocabulary: production in a new sentence ────────────────────────────
  // Recall was already tested by the card drill. What is owed is the word
  // used productively somewhere it has not been used before. The check is
  // deliberately about USE, not grammar: it cannot judge the learner's
  // sentence, so it never claims the word is grammatically mastered — only
  // that the learner reaches for it unprompted.
  if (skill === 'vocabulary' && (label || key)) {
    // SRS review misses key a card by id, sometimes with a `::productive`
    // lane suffix; the learner is shown the word itself, never the internal id.
    const word = String(label || key).split('::')[0];
    return {
      kind: FOLLOW_UP_KINDS.PRODUCTION,
      type,
      targetId,
      skill,
      key,
      label: word,
      word,
      // Not held-out material: it is the same word, used productively. That is
      // transfer of USE, and it is recorded as exactly that.
      heldOut: false,
      encounterId: `followup:${targetId}:${type}:${dayIndex}`,
      prompt: `Use «${word}» in a sentence of your own — something new, not one from this app.`,
    };
  }

  // ── Listening: a graded check on a recording the learner has not heard ───
  // Listening CAN be checked honestly and offline: every authored track ships
  // its own comprehension questions, so the verdict comes from what the learner
  // understood, not from the fact that audio played. The only rule that matters
  // is freshness — the track must be one this session has not already put on
  // and one the learner has never scored, otherwise it is a replay.
  if (skill === 'listening') {
    const heard = new Set(Array.isArray(options.heardTrackIds) ? options.heardTrackIds : []);
    const pool = (Array.isArray(options.tracks) ? options.tracks : []).filter((t) => (
      t && t.id
      && t.id !== options.sessionTrackId
      && !heard.has(t.id)
      // A track with no questions cannot be graded, so it cannot be evidence.
      && Array.isArray(t.questions) && t.questions.length > 0
    ));
    if (!pool.length) return null;
    const track = rotate(pool, dayIndex)[0];
    return {
      kind: FOLLOW_UP_KINDS.LISTENING,
      type,
      targetId,
      skill,
      key,
      label: track.title || label,
      track,
      // Unheard audio with unseen questions: this is the one task whose
      // material is genuinely held out from the learner.
      heldOut: true,
      encounterId: `followup:${track.id}:${type}:${dayIndex}`,
      prompt: 'Something you have not heard before — same ear work.',
      // A clean pass means full comprehension of unseen audio. Anything less is
      // not proof of transfer, and a revealed transcript makes it assisted.
      passAt: 100,
    };
  }

  // Pronunciation, speaking and reading still have no offline check that can be
  // honestly GRADED against this target.
  //
  // Pronunciation is spoken, and the only honest scorer (Pronunciation.jsx
  // read-aloud) needs a microphone and an ASR path — when those are absent
  // the check would silently vanish, and the model must not promise a check it
  // may never run. Speaking already has its own transfer step: the ChatArena
  // "use it somewhere new" challenge, whose verified result records transfer
  // evidence directly (see learnerErrorStore's `transferVerified`). Reading
  // needs a comprehension item pool keyed to the weak skill.
  //
  // Returning null is the point. It is what tells the session to promise
  // nothing today instead of manufacturing a pass — and it is the honest
  // answer for these skills until the check itself can be graded.
  return null;
}

/**
 * Grade a typed production answer: the word must appear, inside a sentence of
 * the learner's own, not as a copy of the item itself.
 *
 * The novelty test is the same one the speaking loop uses for its
 * fresh-context step, so "a different situation" means the same thing in both
 * places. Deterministic and offline: the AI is an enhancement elsewhere, never
 * the source of this verdict.
 *
 * @returns {{correct: boolean, reason: string}}
 */
export function gradeProduction(task, answer) {
  const word = normalise(task?.word);
  const said = normalise(answer);
  if (!word) return { correct: false, reason: 'no-target' };
  if (!said) return { correct: false, reason: 'empty' };
  if (!new RegExp(`(^| )${escapeRegExp(word)}( |$)`, 'u').test(said)) {
    return { correct: false, reason: 'target-missing' };
  }
  // The word on its own is recall, not use.
  if (said === word) return { correct: false, reason: 'no-sentence' };
  const novelty = assessTransferNovelty(answer, { correction: task?.word || task?.label || '', original: '' });
  if (!novelty.transferred) return { correct: false, reason: novelty.reason };
  return { correct: true, reason: 'used-in-new-sentence' };
}

/**
 * What a clean pass on this task proves — and, just as importantly, what it
 * does not. Kept with the plan for inspection; learners see `followUpCopy`.
 */
export function proofFor(task) {
  if (!task) return 'no honest check could be built for this weakness today';
  switch (task.kind) {
    case FOLLOW_UP_KINDS.AUTHORED:
      return task.heldOut
        ? 'unseen sentences on the same rule show the rule was learned, not the sentences'
        : 'a delayed recall of the same rule, unassisted, after a gap';
    case FOLLOW_UP_KINDS.PRODUCTION:
      return 'using the word unprompted in a new sentence shows it is reachable in production, not only in recognition';
    case FOLLOW_UP_KINDS.LISTENING:
      return 'understanding a recording the learner has never heard shows the ear holds up on new material, not just the practised one';
    default:
      return 'practice only; no claim is made from this check';
  }
}

/** Plain-language framing for the segment. No engine vocabulary. */
export function followUpCopy(task) {
  if (!task) return 'This one still needs a check we can run today.';
  switch (task.kind) {
    case FOLLOW_UP_KINDS.AUTHORED:
      return task.type === 'delayed'
        ? 'You fixed this a while back — here it is again, on its own.'
        : 'You repaired this earlier. Here are different sentences for the same rule.';
    case FOLLOW_UP_KINDS.PRODUCTION:
      return task.type === 'delayed'
        ? 'You fixed this word a while back — use it again, on your own.'
        : 'Use this word in a new sentence — nothing to pick from.';
    case FOLLOW_UP_KINDS.LISTENING:
      return task.type === 'delayed'
        ? 'You got this one before. Here is something else entirely.'
        : 'Listen to something new, then answer on what you understood.';
    default:
      return 'A check you owe yourself.';
  }
}

/**
 * The verdict for a graded listening result.
 *
 * Full comprehension of unseen audio is the bar, because a listening weakness
 * is precisely "the ear gives out on material it has not met". Partial
 * comprehension is recorded, honestly, as a miss.
 *
 * @param {object} task the listening task
 * @param {{score?: number, transcriptRevealed?: boolean, replayCount?: number}} result
 */
export function gradeListening(task, result = {}) {
  const score = Math.max(0, Math.min(100, Math.round(Number(result.score) || 0)));
  // Reading along is support, not comprehension — it can extend "improving"
  // but must never count as an independent transfer.
  const assisted = result.transcriptRevealed === true || Number(result.replayCount) > 2;
  return { correct: !assisted && score >= (task?.passAt ?? 100), score, assisted };
}
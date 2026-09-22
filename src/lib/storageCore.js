// Storage core — the physical layer beneath every domain store.
//
// Owns the canonical key map (every `fp.*` key, byte-identical to the
// original storage.js block) and the learner-routing read/write primitives:
// with a household active, learner-owned keys are transparently re-keyed to
// `fp.learner.<memberId>.<suffix>`, with a one-shot claim migration so the
// first member inherits the pre-household data. Nothing else in the app may
// touch localStorage except through here (or the legacy facade in
// storage.js, which is being migrated store by store).
//
// Note: `KEYS.activeSession` is intentionally absent — the canonical key is
// `active` ('fp.activeSession'). A phantom `activeSession` entry once sat in
// the learner-routing set, which silently un-namespaced the in-flight
// session for households; the registry test pins the set against KEYS.

const KEYS = {
  apiKey: 'fp.groqKey',
  sessions: 'fp.sessions', // durable array of completed session summaries
  sessionHistoryMeta: 'fp.sessionHistory.v2', // migration marker for unbounded session history
  sessionHistory: 'fp.sessionHistory.v1', // canonical, uncapped completed-session history
  studyEvents: 'fp.studyEvents.v1', // durable cross-mode activity/event trail
  learnerErrors: 'fp.learnerErrors.v1', // persistent grammar/vocab/listening/pronunciation gaps
  migrations: 'fp.storageMigrations.v1', // one-time local schema migrations
  pulseHistory: 'fp.pulse-history.v2', // versioned, transcript-free history for Pulse
  pulseOptIn: 'fp.pulse-opt-in', // Le Studio's own Pulse opt-in, separate from the mirror it gates
  reviewEvents: 'fp.reviewEvents.v2', // durable per-review events; reviewLog remains a heatmap aggregate
  evidenceLedger: 'fp.evidenceLedger.v1', // cross-mode evidence ledger (recycling queue)
  streak: 'fp.streak', // { count, lastDay }
  srs: 'fp.srs', // { [cardId]: { interval, due, reps } }
  settings: 'fp.settings', // { ttsRate, mockMode, devPanel, theme, level, dailyGoal }
  xp: 'fp.xp', // lifetime experience points
  xpDay: 'fp.xpDay', // { day: 'YYYY-MM-DD', amount } — today's XP toward the goal
  active: 'fp.activeSession', // { scenarioId, history } — in-flight conversation
  habits: 'fp.habits', // [{ text, key, count, lastSeen }] — recurring mistakes
  notebook: 'fp.notebook', // [{ id, fr, en, note, addedAt }] — saved words
  grammar: 'fp.grammar', // { [topicId]: { best, attempts, lastAt } } — quiz results
  wordCache: 'fp.wordCache', // { [word]: translation } — tap-to-translate lookups
  reviewLog: 'fp.reviewLog', // { 'YYYY-MM-DD': count } — daily review activity (heatmap)
  reminderDay: 'fp.reminderDay', // last day a smart reminder fired
  prefs: 'fp.prefs', // personalisation: learning style, lesson length, topics, adaptive
  coins: 'fp.coins', // spendable currency (earned with XP, achievements, challenges)
  achievements: 'fp.achievements', // { [id]: dateUnlocked }
  challenges: 'fp.challenges', // { day, counts: { metric: n }, claimed: [ids] }
  avatar: 'fp.avatar', // selected avatar id
  avatarsOwned: 'fp.avatarsOwned', // [ids] purchased/unlocked
  collectibles: 'fp.collectibles', // { [id]: dateEarned }
  eventXp: 'fp.eventXp', // { [eventId]: xp earned during the event }
  xpLog: 'fp.xpLog', // { 'YYYY-MM-DD': xp } — daily XP history (calendar, weekly goal)
  freezes: 'fp.freezes', // streak freezes owned (auto-consumed on a 1-day gap)
  vacation: 'fp.vacation', // ISO day until which streak loss is paused
  weeklyDays: 'fp.weeklyDaysTarget', // days-per-week frequency target (Habit-style weekly rule)
  household: 'fp.household.v1', // { members: [{id,name,createdAt,streak}], activeId } — family mode
  grammarErrors: 'fp.grammarErrors', // { [topicId]: count } — Arena mistake classifications
  gettingStarted: 'fp.gettingStarted', // '1' once the Home checklist is dismissed
  lastActivity: 'fp.lastActivity', // { type, id?, label, at } — powers Home's continue card
  timeLog: 'fp.timeLog', // { 'YYYY-MM-DD': seconds } — time studied per day
  metrics: 'fp.metrics', // [{ skill, score, at }] — scored-activity log for analytics
  examBoundaries: 'fp.examBoundaries.v1', // learner/teacher-supplied grade-boundary sets
  examinerScripts: 'fp.examinerScripts.v1', // real app-vs-human marking pairs
  realExamResults: 'fp.realExamResults.v1', // real predicted-vs-returned grades
  habitTracker: 'fp.habitTracker', // { list: [{id,name}], done: { habitId: { 'YYYY-MM-DD': true } } }
  onboarded: 'fp.onboarded', // '1' once the first-run onboarding is done/skipped
  syncId: 'fp.syncId', // stable local account id — travels with a sync snapshot
  lastBackup: 'fp.lastBackup', // ISO time of the last export/sync-code created
  starred: 'fp.starredLines', // [{ id, fr, en, source, addedAt }] — favourited survival phrases
  weaknessMemory: 'fp.weaknessMemory', // persistent weakness memory: error → repair → retest → recurrence
  errorNotebook: 'fp.errorNotebook', // detailed writing/speaking corrections
  phonemeProfile: 'fp.phonemeProfile', // pronunciation attempts by phoneme
  // ---- validation & corpus infrastructure (empty until externally supplied) ----
  placementValidations: 'fp.placementValidations.v1', // [{ knownLevel, placedLevel, theta, se, itemsAsked, at, rater, source }]
  progressionValidations: 'fp.progressionValidations.v1', // [{ from, to, unseen:{}, transfer }]
  writingSpeakingCorpus: 'fp.writingSpeakingCorpus.v1', // human-marked writing/speaking pairs
  comprehensionValidations: 'fp.comprehensionValidations.v1', // human-validated listening/reading scores
  assistanceLog: 'fp.assistanceLog.v1', // with/without support events
  contentCalibration: 'fp.contentCalibration.v1', // cached audit results
  lastPlacement: 'fp.lastPlacement.v1', // most recent adaptive placement result, for teacher pairing
  intelligibilityBenchmark: 'fp.intelligibilityBenchmark.v1', // human-rated recordings { target, transcript, humanMean, raters }
  authenticAudioPack: 'fp.authenticAudioPack.v1', // imported licensed-recording catalog (validated by authenticAudio.validateAsset)
  listeningProgression: 'fp.listeningProgression.v1', // { currentStage, attempts[], unlockedAt{}, stageStats[] }
  mistakeGraph: 'fp.mistakeGraph.v1', // structural mistakes with mastery lifecycle (mistakeGraph.js)
  selectionTrial: 'fp.selectionTrial.v1', // frozen per-session target-selection records (P1 analysis)
  studyState: 'fp.study.state.v1', // Evidence Study enrolment (anonymous participant, locked arm)
  studyConsent: 'fp.study.consent.v1', // explicit consent record, SEPARATE from outcomes
  studyChecks: 'fp.study.checks.v1', // held-out transfer check records (measurement-only)
  studyOutcomes: 'fp.study.outcomes.v1', // per-selection longitudinal outcome rows
  studyArmOverride: 'fp.study.armOverride.v1', // study operators only; never set in the UI
  studyImported: 'fp.study.imported.v1', // imported researcher bundles (aggregation only, never local truth)
  learnerRegistry: 'fp.learnerRegistry.v1', // per-learner namespace registry + migration marker
  languageModel: 'fp.languageModel.v1', // explicit grammar transfer stages
  fieldNotes: 'fp.fieldNotes.v1', // learner-captured real-world phrases and transfer evidence
  conversationMode: 'fp.conversationMode', // 'coach' | 'fluency' — Arena correction policy
  cultureSeen: 'fp.cultureSeen', // [articleId] — Culture items already opened
  realworldSeen: 'fp.realworldSeen', // [itemId] — RealWorld items already opened
};

export { KEYS };

let storageFull = false;

// True when the last write tripped the quota — surfaced in Settings/DevPanel
// so "where did my progress go" has an answer.
export const storageFullWarning = () => storageFull;

// Event streams that can be pruned when the quota is hit: recent history is
// kept, older entries are dropped rather than losing fresh progress.
const PRUNEABLE_KEYS = [KEYS.reviewEvents, KEYS.studyEvents, KEYS.pulseHistory];

/** Raw read: no learner routing. The only reader that touches localStorage. */
function readRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    // Corrupt value: drop it once so the next write starts clean instead of
    // silently returning the fallback forever.
    try { localStorage.removeItem(key); } catch { /* unavailable */ }
    return fallback;
  }
}

// ---- per-learner namespaces (household isolation) ---------------------------
//
// LEARNER_KEYS are the keys that belong to ONE learner. With a household
// active, they are re-keyed to `fp.learner.<memberId>.<suffix>` so every
// member gets independent progress. The physical re-key is LAZY: reads fall
// back to the legacy key until the value has been claimed, so a user who
// never opens a second-member session keeps byte-identical data in place,
// and export/import keeps working.

const LEARNER_KEY_VALUES = [
  KEYS.srs, KEYS.notebook, KEYS.grammar, KEYS.mistakeGraph, KEYS.selectionTrial,
  KEYS.sessionHistory, KEYS.sessionHistoryMeta, KEYS.studyEvents, KEYS.reviewEvents,
  KEYS.reviewLog, KEYS.evidenceLedger, KEYS.learnerErrors, KEYS.metrics,
  KEYS.grammarErrors, KEYS.weaknessMemory, KEYS.languageModel, KEYS.fieldNotes,
  KEYS.studyState, KEYS.studyConsent, KEYS.studyChecks, KEYS.studyOutcomes,
  KEYS.lastPlacement, KEYS.errorNotebook, KEYS.starred,
  KEYS.xp, KEYS.xpDay, KEYS.xpLog, KEYS.timeLog, KEYS.active,
  // Preferences/progress that used to live as raw component-level keys: with
  // a household active each member now keeps their own mode and seen-lists;
  // the one-shot claim keeps every pre-existing value with the first member.
  KEYS.conversationMode, KEYS.cultureSeen, KEYS.realworldSeen,
];

const LEARNER_KEY_SET = new Set(LEARNER_KEY_VALUES);

export const isLearnerKey = (key) => LEARNER_KEY_SET.has(key);

const learnerKey = (key, memberId) => `fp.learner.${memberId}.${key}`;

function learnerRegistry() {
  return read(KEYS.learnerRegistry, { claims: {} });
}

function saveLearnerRegistry(reg) {
  write(KEYS.learnerRegistry, reg);
  return reg;
}

/**
 * Claim the legacy shared value for `memberId` exactly once. The FIRST
 * member on an install inherits the pre-household single-user data (never
 * orphaned, never duplicated); members created afterwards start empty. The
 * legacy value stays on disk but is never read again once the claim exists.
 */
function claimLegacyFor(key, memberId) {
  if (!LEARNER_KEY_SET.has(key)) return;
  const reg = learnerRegistry();
  if (!reg.claims || typeof reg.claims !== 'object') reg.claims = {};
  if (reg.claims[key]) return;
  reg.claims[key] = memberId;
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { raw = null; }
  if (raw != null) {
    try { localStorage.setItem(learnerKey(key, memberId), raw); } catch { /* quota */ }
  }
  saveLearnerRegistry(reg);
}

/** The active learner id for namespacing (null = no household in play).
 *  Reads the household registry DIRECTLY — routing through read() here would
 *  recurse (read → learnerRead → activeLearnerId → household read → read). */
export const activeLearnerId = () => {
  try {
    const h = cleanHousehold(readRaw(KEYS.household, null));
    return h.activeId || null;
  } catch {
    return null;
  }
};

/** Namespaced read: the active learner's value, with legacy fallback. */
function learnerRead(key, fallback) {
  const memberId = activeLearnerId();
  if (!memberId) return readRaw(key, fallback);
  claimLegacyFor(key, memberId);
  return readRaw(learnerKey(key, memberId), fallback);
}

function learnerWrite(key, value) {
  const memberId = activeLearnerId();
  if (!memberId) { writeRaw(key, value); return; }
  claimLegacyFor(key, memberId);
  writeRaw(learnerKey(key, memberId), value);
}

/** The one public read: learner-aware for learner-owned keys. */
export function read(key, fallback) {
  if (LEARNER_KEY_SET.has(key)) return learnerRead(key, fallback);
  return readRaw(key, fallback);
}

/** Read a SPECIFIC learner's namespaced value (household switching UIs). */
export function readLearnerValue(memberId, key, fallback = null) {
  if (!memberId) return read(key, fallback);
  return read(learnerKey(key, memberId), fallback);
}

/** Delete every namespaced value for a member (GDPR-style member removal). */
export function purgeLearnerData(memberId) {
  if (!memberId) return 0;
  let purged = 0;
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`fp.learner.${memberId}.`)) doomed.push(k);
    }
    for (const k of doomed) {
      try { localStorage.removeItem(k); purged += 1; } catch { /* unavailable */ }
    }
  } catch { /* unavailable */ }
  return purged;
}

/** Raw write: no learner routing. */
function writeRaw(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: try to make room by halving the growing
    // event logs, then retry once. Never lose the current key's data without
    // attempting this.
    if (!storageFull) storageFull = true;
    if (PRUNEABLE_KEYS.includes(key)) {
      try {
        const half = readRaw(key, null);
        if (Array.isArray(half) && half.length > 8) {
          localStorage.setItem(key, JSON.stringify(half.slice(-Math.floor(half.length / 2))));
          return;
        }
      } catch { /* give up quietly */ }
    }
    for (const k of PRUNEABLE_KEYS) {
      if (k === key) continue;
      try {
        const arr = readRaw(k, null);
        if (Array.isArray(arr) && arr.length > 16) {
          localStorage.setItem(k, JSON.stringify(arr.slice(-Math.floor(arr.length / 2))));
          try { localStorage.setItem(key, JSON.stringify(value)); return; } catch { /* still full */ }
        }
      } catch { /* keep pruning */ }
    }
  }
}

/** The one public write: learner-aware for learner-owned keys. */
export function write(key, value) {
  if (LEARNER_KEY_SET.has(key)) { learnerWrite(key, value); return; }
  writeRaw(key, value);
}

function blankHousehold() {
  return { members: [], activeId: null };
}

function cleanHousehold(h) {
  if (!h || !Array.isArray(h.members)) return blankHousehold();
  const members = h.members
    .filter((m) => m && typeof m.id === 'string' && m.id)
    .map((m) => ({
      id: m.id,
      name: String(m.name || '').trim().slice(0, 40) || 'Learner',
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : null,
      streak: m.streak && Number.isInteger(m.streak.count) && m.streak.count >= 0
        ? { count: m.streak.count, lastDay: typeof m.streak.lastDay === 'string' ? m.streak.lastDay : null }
        : { count: 0, lastDay: null },
    }));
  const activeId = members.some((m) => m.id === h.activeId) ? h.activeId : (members[0]?.id || null);
  return { members, activeId };
}

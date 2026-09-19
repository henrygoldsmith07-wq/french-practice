// Research & validation store — HEARD HALF.
//
// This module carries the parts of the research domain that pull in the
// measurement stack (placement/progression/corpus/comprehension validation,
// intelligibility, evidenceStudy, studyConsent, studyProtocol). Those imports
// are large and serve lazy screens and tests only — Analytics, DevPanel,
// StudyPanel, ChatArena, ExamSimulator, WritingStudio — so the whole module
// is dynamically imported by its consumers and never rides the boot graph.
// storage.js keeps only the light CRUD of stores/researchStore.js.
//
// Keys, shapes, caps and learner-namespacing behaviour are byte-identical to
// the original storage.js implementation: storageCore owns the key map and
// the read/write primitives, exactly as before.
//
// Import policy: this module never imports storage.js (a cycle would make
// the facade fragile); it talks to storageCore directly and to studyStore
// for the bundle machinery's consent/imported-bundle reads.

import {
  makePlacementValidationEntry as _makePlacementEntry,
  placementValidationMetrics as _placementMetrics,
} from '../placementValidation.js';
import {
  makeProgressionEntry as _makeProgEntry,
  progressionValidationMetrics as _progMetrics,
} from '../progressionValidation.js';
import {
  makeCorpusEntry as _makeCorpusEntry,
  corpusMetrics as _corpusMetrics,
} from '../writingSpeakingCorpus.js';
import {
  makeComprehensionEntry as _makeCompEntry,
  comprehensionAgreement as _compAgreement,
} from '../listeningReadingValidation.js';
import { studyProgress as _studyProgress } from '../validationStudy.js';
import {
  makeAssistanceEvent as _makeAsst,
  assistanceMetrics as _asstMetrics,
} from '../assistanceValidation.js';
import { makeBenchmarkSample as _makeBenchmarkSample } from '../intelligibility.js';
import { validatePerItemEntry } from '../evidenceStudy.js';
import { consentTrailOk } from '../studyConsent.js';
import { protocolRecord } from '../studyProtocol.js';
import { read, write, KEYS } from '../storageCore.js';
import {
  getStudyState, getStudyConsent, getStudyChecks, getStudyOutcomes,
  getImportedStudyBundles, saveImportedStudyBundles,
} from './studyStore.js';
import {
  getPlacementValidations,
  getProgressionValidations,
  getWritingSpeakingCorpus,
  getComprehensionValidations,
  getExaminerScripts, recordExaminerMark,
  getRealExamResults, recordRealExamResult,
  getIntelligibilityBenchmark,
} from './researchStore.js';

// Re-export the study-machinery helpers the moved code needs, so consumers
// can pull them from ONE lazy module instead of their heavy homes directly.
export { validatePerItemEntry, consentTrailOk, protocolRecord };

// ---- placement validation store (requires external known levels) ----

export function recordPlacementValidation(entry) {
  const made = _makePlacementEntry(entry);
  if (!made) return null;
  const list = getPlacementValidations();
  list.push(made);
  write(KEYS.placementValidations, list.slice(-500));
  return made;
}

export const getPlacementValidationMetrics = () =>
  _placementMetrics(getPlacementValidations());

// ---- progression validation store ----

export function recordProgressionValidation(entry) {
  const made = _makeProgEntry(entry);
  if (!made) return null;
  const list = getProgressionValidations();
  list.push(made);
  write(KEYS.progressionValidations, list.slice(-500));
  return made;
}

export const getProgressionValidationMetrics = () =>
  _progMetrics(getProgressionValidations());

// ---- writing/speaking human-marked corpus ----

export function recordCorpusEntry(entry) {
  const made = _makeCorpusEntry(entry);
  if (!made) return null;
  const list = getWritingSpeakingCorpus();
  list.push(made);
  write(KEYS.writingSpeakingCorpus, list.slice(-1000));
  return made;
}

export function updateCorpusHumanMark(id, { humanScore, humanCorrections, rater, consensus }) {
  const list = getWritingSpeakingCorpus();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const entry = list[idx];
  const score = Number.isFinite(Number(humanScore)) ? Math.max(0, Math.min(100, Math.round(Number(humanScore)))) : entry.humanScore;
  list[idx] = {
    ...entry,
    humanScore: score,
    humanCorrections: humanCorrections != null ? String(humanCorrections).slice(0, 8000) : entry.humanCorrections,
    rater: rater != null ? String(rater).slice(0, 80) : entry.rater,
    consensus: consensus != null ? String(consensus).slice(0, 200) : entry.consensus,
    hasHuman: true,
    paired: entry.aiScore != null && score != null,
    doubleMarked: score != null && entry.humanScore2 != null,
  };
  write(KEYS.writingSpeakingCorpus, list);
  return list[idx];
}

// Independent second marker (double-marking): must be a different rater than
// the first mark, otherwise agreement is measured against itself.
export function updateCorpusSecondMark(id, { humanScore2, humanCorrections2, rater2 }) {
  const list = getWritingSpeakingCorpus();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const entry = list[idx];
  if (entry.rater && rater2 && String(rater2).trim() === String(entry.rater).trim()) return null;
  const score = Number.isFinite(Number(humanScore2)) ? Math.max(0, Math.min(100, Math.round(Number(humanScore2)))) : null;
  if (score == null) return null;
  list[idx] = {
    ...entry,
    humanScore2: score,
    humanCorrections2: humanCorrections2 != null ? String(humanCorrections2).slice(0, 8000) : entry.humanCorrections2,
    rater2: rater2 != null ? String(rater2).slice(0, 80) : entry.rater2,
    consensus: score != null && entry.humanScore != null
      ? String(Math.round((Number(entry.humanScore) + score) / 2))
      : entry.consensus,
    doubleMarked: entry.humanScore != null,
  };
  write(KEYS.writingSpeakingCorpus, list);
  return list[idx];
}

export const getCorpusMetrics = () => _corpusMetrics(getWritingSpeakingCorpus());

// ---- listening/reading comprehension validation (human marks) ----

export function recordComprehensionValidation(entry) {
  const made = _makeCompEntry(entry);
  if (!made) return null;
  const list = getComprehensionValidations();
  list.push(made);
  write(KEYS.comprehensionValidations, list.slice(-1000));
  return made;
}

// Pair a human mark with an entry whose system score was recorded earlier.
export function updateComprehensionHumanMark(id, { humanScore, rater }) {
  const list = getComprehensionValidations();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const entry = list[idx];
  const score = Number.isFinite(Number(humanScore)) ? Math.max(0, Math.min(100, Math.round(Number(humanScore)))) : null;
  if (score == null) return null;
  list[idx] = {
    ...entry,
    humanScore: score,
    rater: rater != null ? String(rater).slice(0, 80) : entry.rater,
    hasHuman: true,
    paired: entry.aiScore != null,
    doubleMarked: entry.humanScore2 != null,
  };
  write(KEYS.comprehensionValidations, list);
  return list[idx];
}

// Independent second marker — must differ from the first rater.
export function updateComprehensionSecondMark(id, { humanScore2, rater2 }) {
  const list = getComprehensionValidations();
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const entry = list[idx];
  if (entry.rater && rater2 && String(rater2).trim() === String(entry.rater).trim()) return null;
  const score = Number.isFinite(Number(humanScore2)) ? Math.max(0, Math.min(100, Math.round(Number(humanScore2)))) : null;
  if (score == null) return null;
  list[idx] = {
    ...entry,
    humanScore2: score,
    rater2: rater2 != null ? String(rater2).slice(0, 80) : entry.rater2,
    doubleMarked: entry.humanScore != null,
  };
  write(KEYS.comprehensionValidations, list);
  return list[idx];
}

export const getComprehensionValidationMetrics = (skill) => {
  const m = _compAgreement(getComprehensionValidations(), skill ? { skill } : undefined);
  return m;
};

// ---- validation study: bundle export/import + progress toward targets ----
//
// The evidence base only grows through genuine human contribution. Bundles
// let a teacher or researcher collect marks elsewhere and import them once;
// progress rows show honestly how far each stream is from its study target.
// There is deliberately no way to synthesise entries here.

const VALIDATION_STORES = {
  placementValidations: { get: () => getPlacementValidations(), record: (...a) => recordPlacementValidation(...a) },
  progressionValidations: { get: () => getProgressionValidations(), record: (...a) => recordProgressionValidation(...a) },
  writingSpeakingCorpus: { get: () => getWritingSpeakingCorpus(), record: (...a) => recordCorpusEntry(...a) },
  comprehensionValidations: { get: () => getComprehensionValidations(), record: (...a) => recordComprehensionValidation(...a) },
  intelligibilityBenchmark: { get: () => getIntelligibilityBenchmark(), record: (...a) => recordBenchmarkSample(...a) },
  examinerScripts: { get: () => getExaminerScripts(), record: (...a) => recordExaminerMark(...a) },
  realExamResults: { get: () => getRealExamResults(), record: (...a) => recordRealExamResult(...a) },
};

export function buildValidationBundle() {
  const stores = {};
  for (const [key, spec] of Object.entries(VALIDATION_STORES)) stores[key] = spec.get();
  return {
    format: 'le-studio.validation-study',
    version: 1,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

// V2 bundle: adds the anonymised Evidence Study streams. Participant id is
// already anonymous; the arm is INCLUDED (researchers need it for the
// two-arm comparison) because export is the consented, explicit act — the
// in-app UI still never reveals it. No transcripts, no names, no raw text.
export function buildStudyBundle({ includeStudy = true } = {}) {
  const bundle = buildValidationBundle();
  if (!includeStudy) return bundle;
  const study = getStudyState();
  // Study export follows the CONSENT TRAIL (accepted, identity valid), not
  // the live write guard: a withdrawn participant's identity/attrition record
  // and any data collected before withdrawal stay exportable for honest
  // attrition analysis — and nothing new can be written once withdrawn.
  if (!consentTrailOk(getStudyConsent(), study)) {
    bundle.version = 2;
    bundle.study = null;
    bundle.studyOutcomes = [];
    bundle.studyChecks = [];
    bundle.studyExportNote = 'Study streams withheld: no consented participation on this device.';
    return bundle;
  }
  bundle.version = 2;
  bundle.study = study ? {
    // ── participant dataset contract: the minimum metadata needed for
    // reproducible analysis. No transcripts, no names, no raw sentences.
    participantId: study.participantId,
    arm: study.arm,                       // researchers need the arm; UI never shows it
    armSource: study.armSource,
    startLevel: study.startLevel ?? null, // CEFR band only, never theta
    startTheta: null,                     // deliberately stripped: not needed for analysis
    enrolledAt: study.enrolledAt,
    weeks: study.weeks ?? null,
    status: study.status,                 // active | withdrawn (completion in outcomes)
    withdrawnAt: study.withdrawnAt ?? null,
    completedAt: study.completedAt ?? null,
    lastActivityAt: study.lastActivityAt ?? null, // attrition metadata (not inferred)
    engineVersion: study.engineVersion ?? null,
    schemaVersion: study.schemaVersion ?? null,
    protocolVersion: study.protocolVersion ?? null,
    baseline: study.baseline ?? null,     // study-start measures with capturedAt (nulls preserved)
  } : null;
  bundle.protocol = protocolRecord();     // frozen methodology in force
  bundle.studyOutcomes = getStudyOutcomes().map((o) => ({
    id: o.id,
    participantId: study.participantId,   // rows are labelled with their participant
    at: o.at,
    day: o.day ?? null,
    activity: o.activity ?? null,
    variant: o.variant ?? null,
    concept: o.concept ?? null,
    type: o.type ?? null,
    masteryBefore: o.masteryBefore ?? null,
    immediate: o.immediate ?? null,
    delayedShort: o.delayedShort ?? null,
    delayedLong: o.delayedLong ?? null,
    transfer: o.transfer ?? null,
    recurred: o.recurred ?? null,
    hintsUsed: o.hintsUsed ?? null,
    timeSpent: o.timeSpent ?? null,
    completed: o.completed ?? null,
    delivered: Array.isArray(o.delivered) ? o.delivered.map((d) => ({ id: d.id, seconds: d.seconds ?? null, skipped: Boolean(d.skipped) })) : null,
    treatmentConsistency: o.treatmentConsistency ?? null,
  }));
  bundle.studyChecks = getStudyChecks().map((c) => ({
    id: c.id,
    day: c.day,
    level: c.level,
    at: c.at,
    // Frozen assessment payloads travel so held-out provenance and scoring
    // stay reproducible off-device (ids + prompts + options only).
    items: (c.items || []).map((it) => ({
      assessmentId: it.assessmentId ?? null,
      sourceItemId: it.sourceItemId ?? null,
      skill: it.skill ?? null,
      cefr: it.cefr ?? null,
      content: it.content ?? null,
      options: it.options ?? [],
      correctOptionId: it.correctOptionId ?? null,
      accept: it.accept ?? null,
    })),
    skills: c.skills ?? null,             // per-skill accounting; transfer stays per-skill
    scheduledSkill: c.scheduledSkill ?? null,
    trackId: c.trackId ?? null,
    results: c.results ?? null,
    engineVersion: c.engineVersion ?? null,
    protocolVersion: c.protocolVersion ?? null,
  }));
  return bundle;
}

export function ingestValidationBundle(json, { dryRun = false } = {}) {
  const report = { ok: false, dryRun: Boolean(dryRun), added: {}, skipped: 0, attempted: 0, errors: [] };
  let bundle;
  try {
    bundle = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (e) {
    report.errors.push(`Not valid JSON: ${e.message}`);
    return report;
  }
  if (bundle?.format !== 'le-studio.validation-study' || !bundle.stores || typeof bundle.stores !== 'object') {
    report.errors.push('Not a Le Studio validation bundle (missing format/stores).');
    return report;
  }
  for (const [key, spec] of Object.entries(VALIDATION_STORES)) {
    const incoming = bundle.stores[key];
    if (!Array.isArray(incoming)) continue;
    const existing = new Set(spec.get().map((e) => e?.id).filter(Boolean));
    let added = 0;
    for (const entry of incoming) {
      report.attempted += 1;
      if (!entry || typeof entry !== 'object') {
        report.errors.push(`${key}: entry is not an object`);
        continue;
      }
      if (entry.id && existing.has(entry.id)) {
        report.skipped += 1;
        continue;
      }
      if (dryRun) {
        added += 1;
        continue;
      }
      const made = spec.record(entry);
      if (made) {
        added += 1;
        if (made.id) existing.add(made.id);
      } else {
        report.errors.push(`${key}: entry rejected by schema${entry?.id ? ` (${entry.id})` : ''}`);
      }
    }
    report.added[key] = added;
  }
  // V2 study streams: imported bundles are pooled for researchers, never
  // merged into this device's own study state or outcomes.
  if (bundle.study && bundle.study.participantId) {
    const key = `${bundle.study.participantId}|${bundle.study.enrolledAt || ''}`;
    const existing = getImportedStudyBundles();
    const dupe = existing.some((b) => `${b.participantId}|${b.enrolledAt || ''}` === key);
    report.attempted += 1;
    // Preregistered schema first: malformed research records are rejected,
    // never coerced or half-imported.
    const badPerItem = (Array.isArray(bundle.studyChecks) ? bundle.studyChecks : [])
      .flatMap((c) => (c && c.results && Array.isArray(c.results.perItem)) ? c.results.perItem : [])
      .map((e) => validatePerItemEntry(e))
      .filter(Boolean);
    if (badPerItem.length) {
      badPerItem.slice(0, 5).forEach((reason) => report.errors.push(`studyChecks: ${reason}`));
      report.ok = false;
      return report;
    }
    if (dupe) {
      report.skipped += 1;
      report.added.studyAggregates = 0;
    } else if (dryRun) {
      report.added.studyAggregates = 1;
    } else {
      existing.push({
        participantId: bundle.study.participantId,
        arm: bundle.study.arm || null,
        enrolledAt: bundle.study.enrolledAt || null,
        study: bundle.study,
        outcomes: Array.isArray(bundle.studyOutcomes) ? bundle.studyOutcomes : [],
        checks: Array.isArray(bundle.studyChecks) ? bundle.studyChecks : [],
        importedAt: new Date().toISOString(),
      });
      saveImportedStudyBundles(existing);
      report.added.studyAggregates = 1;
    }
  }
  report.ok = report.errors.length === 0;
  return report;
}

export const getStudyProgress = () =>
  _studyProgress({
    placements: getPlacementValidations(),
    progression: getProgressionValidations(),
    corpus: getWritingSpeakingCorpus(),
    comprehension: getComprehensionValidations(),
    benchmarks: getIntelligibilityBenchmark(),
    examinerScripts: getExaminerScripts(),
    realExamResults: getRealExamResults(),
  });

// ---- pronunciation intelligibility benchmark (human-labelled samples) ----
//
// The in-source HUMAN_BENCHMARK array stays empty by design; real labelled
// recordings enter here, one validated sample at a time. Nothing generates a
// humanMean — it arrives only from listeners.

export function recordBenchmarkSample(sample) {
  const made = _makeBenchmarkSample(sample);
  if (!made) return null;
  const list = getIntelligibilityBenchmark();
  const next = [...list.filter((s) => s.id !== made.id), made].slice(-2000);
  write(KEYS.intelligibilityBenchmark, next);
  return made;
}

// ── Authentic audio pack: the GETTER lives in the light half (listening.js
// reads it); only the 7-stage progression writer stays heavy-side here.

export const getListeningProgression = () => {
  const v = read(KEYS.listeningProgression, null);
  return v && typeof v === 'object' ? v : { currentStage: 1, attempts: [], unlockedAt: {} };
};

export function saveListeningProgression(state) {
  if (!state || typeof state !== 'object') return getListeningProgression();
  write(KEYS.listeningProgression, state);
  return state;
}

// ---- assistance fading log ----

export const getAssistanceLog = () => {
  const v = read(KEYS.assistanceLog, []);
  return Array.isArray(v) ? v : [];
};

export function recordAssistanceEvent(entry) {
  const made = _makeAsst(entry);
  if (!made) return null;
  const log = getAssistanceLog();
  log.push(made);
  write(KEYS.assistanceLog, log.slice(-600));
  return made;
}

export const getAssistanceMetrics = () => _asstMetrics(getAssistanceLog());

/** Pooled aggregate across imported participants: n per arm, nothing fancier. */
export function importedStudySummary() {
  const imports = getImportedStudyBundles();
  const byArm = { adaptive: 0, balanced: 0 };
  const perParticipant = imports.map((b) => {
    const arm = b.study?.arm || b.arm || null;
    if (arm in byArm) byArm[arm] += 1;
    return {
      participantId: b.participantId,
      arm,
      enrolledAt: b.study?.enrolledAt || null,
      outcomes: Array.isArray(b.outcomes) ? b.outcomes.length : 0,
    };
  });
  return { participants: imports.length, byArm, perParticipant };
}

// Research & validation store — LIGHT HALF.
//
// Pure CRUD over the research streams: read lists, append validated entries,
// update human marks. Nothing here imports the measurement stack
// (placement/progression/corpus/comprehension validation, intelligibility,
// evidenceStudy) — that lives in researchStoreHeavy.js, which consumers
// import dynamically so it never rides the boot graph. storage.js re-exports
// only this light half; Analytics, DevPanel, StudyPanel, ChatArena,
// WritingStudio and the exam screens import researchStoreHeavy.js directly
// for the metric/bundle APIs.
//
// Keys, shapes, caps and learner-namespacing behaviour are byte-identical to
// the original storage.js implementation: storageCore owns the key map and
// the read/write primitives, exactly as before.
//
// Import policy: this module never imports storage.js (a cycle would make
// the facade fragile); it talks to storageCore directly, exactly like every
// other domain store.

import { read, write, KEYS } from '../storageCore.js';

// ---- examiner scripts (real app-vs-human marking pairs) ----

export const getExaminerScripts = () => {
  const value = read(KEYS.examinerScripts, []);
  return Array.isArray(value) ? value : [];
};

export function recordExaminerMark(entry = {}) {
  const appPercent = Number(entry.appPercent);
  const examinerPercent = Number(entry.examinerPercent);
  if (!Number.isFinite(appPercent) || !Number.isFinite(examinerPercent)) return null;
  const saved = {
    ...entry,
    id: String(entry.id || `examiner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    appPercent: Math.max(0, Math.min(100, appPercent)),
    examinerPercent: Math.max(0, Math.min(100, examinerPercent)),
    at: entry.at || new Date().toISOString(),
  };
  write(KEYS.examinerScripts, [...getExaminerScripts(), saved].slice(-500));
  return saved;
}

// ---- real exam results (predicted vs returned grades) ----

export const getRealExamResults = () => {
  const value = read(KEYS.realExamResults, []);
  return Array.isArray(value) ? value : [];
};

export function recordRealExamResult(entry = {}) {
  if (!entry.predictedGrade || !entry.actualGrade) return null;
  const saved = {
    ...entry,
    id: String(entry.id || `result-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    predictedGrade: String(entry.predictedGrade),
    actualGrade: String(entry.actualGrade),
    at: entry.at || new Date().toISOString(),
  };
  write(KEYS.realExamResults, [...getRealExamResults(), saved].slice(-200));
  return saved;
}

// ---- placement validation store (requires external known levels) ----

export const getPlacementValidations = () => {
  const v = read(KEYS.placementValidations, []);
  return Array.isArray(v) ? v : [];
};

// The record* writers for these streams live in the HEAVY half only
// (researchStoreHeavy.js): their schema makers come from the measurement
// stack, and importing that here would pull it back onto the boot graph.
// Consumers that write to these streams import the heavy module directly.

export const getProgressionValidations = () => {
  const v = read(KEYS.progressionValidations, []);
  return Array.isArray(v) ? v : [];
};

// ---- writing/speaking human-marked corpus ----

export const getWritingSpeakingCorpus = () => {
  const v = read(KEYS.writingSpeakingCorpus, []);
  return Array.isArray(v) ? v : [];
};

// ---- listening/reading comprehension validation (human marks) ----

export const getComprehensionValidations = () => {
  const v = read(KEYS.comprehensionValidations, []);
  return Array.isArray(v) ? v : [];
};

// ── Authentic audio: licensed real recordings (pure CRUD) ────────────────
// Lives in the LIGHT half because listening.js (a lazy content chunk) reads
// it; importing the measurement stack from there would bloat the chunk.
export const getAuthenticAudioPack = () => {
  const v = read(KEYS.authenticAudioPack, []);
  return Array.isArray(v) ? v : [];
};

export function setAuthenticAudioPack(assets) {
  write(KEYS.authenticAudioPack, Array.isArray(assets) ? assets : []);
  return getAuthenticAudioPack();
}

// ---- pronunciation intelligibility benchmark (human-labelled samples) ----
//
// The in-source HUMAN_BENCHMARK array stays empty by design; real labelled
// recordings enter here, one validated sample at a time. Nothing generates a
// humanMean — it arrives only from listeners.

export const getIntelligibilityBenchmark = () => {
  const v = read(KEYS.intelligibilityBenchmark, []);
  return Array.isArray(v) ? v : [];
};

// ---- assistance fading log ----

export const getAssistanceLog = () => {
  const v = read(KEYS.assistanceLog, []);
  return Array.isArray(v) ? v : [];
};

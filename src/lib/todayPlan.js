// Today's plan builder — the whole "what should this learner practise today?"
// decision, OUTSIDE React.
//
// TodaySession used to assemble this inside a useMemo; the logic lives here so
// it is testable without rendering, reusable by the Today dashboard's preview,
// and adding a new activity type does not grow the session component.
//
// Study discipline preserved verbatim: the balanced (control) arm strips
// learner-specific targeting at the drill-slot registry, the trial freezes
// its candidate set before selection, and a broken measurement call never
// blocks practice.

import { buildDailyCurriculum } from './dailyCurriculum.js';
import {
  dueRetests, EVIDENCE_ENGINE_VERSION,
} from './mistakeGraph.js';
import { calibrateSelection } from './selectionCalibration.js';
import {
  probeCapabilities, resolvePlanCapabilities, buildDrillSlot,
} from './todayCapabilities.js';
import { balancedDrillTopic } from './assignment.js';
import {
  getSrs, getNotebook, getDueWeaknesses, getMistakeGraph, getSelectionTrial,
  getLearnerErrors, getLearningEvidenceOverview, getStudyChecks,
  getSkillNeeds, getPlacementSkillNeeds,
} from './storage.js';
import { getErrorNotebook, selectCorrectedErrors, selectDueRetypes } from './errorNotebook.js';
import { hasCapabilityNow } from './capabilities.js';
import { notebookAsEntries, dueEntries, NEW_CARD_CAP } from './memory.js';
import { localDayIndex } from './localDay.js';
import { segmentExplain, recoveryStatus } from './segmentExplain.js';
import { personAt } from './conjugationMeta.js';

/**
 * Build the frozen plan for one Today session.
 *
 * @param {object} input
 * @param {boolean} input.open
 * @param {number} input.minutes
 * @param {string|null} input.apiKey
 * @param {boolean} input.mockMode
 * @param {string|null} input.level
 * @param {Array<object>|null} input.entries vocab library (null = loading)
 * @param {Array<object>|null} input.scenariosReg scenario registry (null = loading)
 * @param {boolean} input.grammarReady
 * @param {Array<object>|null} input.listeningTracks
 * @param {object|null} input.studyModule lazy study module (measurement only)
 * @param {boolean} input.degradedLearning any content capability failed to load
 * @param {boolean} input.conjCap French-authored conjugation available
 * @param {boolean} input.authoredCap authored drills available
 * @param {boolean} input.accentCap accent drill available
 * @returns {object|null} null means "still loading" or "cannot build — retry"
 */
export function buildTodayPlan(input) {
  const {
    open, minutes = 20, apiKey = null, mockMode = false, level = null,
    entries, scenariosReg, grammarReady, listeningTracks,
    studyModule = null, degradedLearning = false,
    conjCap = false, authoredCap = false, accentCap = false,
    now = Date.now(),
  } = input || {};
  if (!open || entries === null || scenariosReg === null || !grammarReady || listeningTracks === null) return null;
  if (!degradedLearning && !studyModule && !input.studyFailed) return null;

  const studyApi = studyModule && !degradedLearning ? studyModule : null;
  const graph = getMistakeGraph();

  // Study enrolment is idempotent and consent-gated; a failure leaves `study`
  // null and every measurement branch below is skipped — the learning plan is
  // unchanged. Study tooling must never break ordinary practice.
  let study = null;
  if (studyApi) {
    try { study = studyApi.enrolStudyState({ startLevel: level || null }); } catch { study = null; }
  }
  let variant = 'adaptive';
  if (study && studyApi) {
    try { variant = studyApi.effectiveVariant({ study }); } catch { variant = 'adaptive'; }
  }
  const balanced = variant === 'balanced';
  const followUpDue = !balanced && hasCapabilityNow('learning-path') ? (() => {
    try { return getLearningEvidenceOverview().due[0] || null; } catch { return null; }
  })() : null;

  // Learner-error producers feed the drill slot. They are built unconditionally
  // and gated in ONE place — the drill-slot registry — so the balanced arm can
  // never leak learner-specific targeting back in through a construction site.
  const trainerGap = !conjCap ? null : (() => {
    try {
      const due = getLearnerErrors({ limit: 12 }).find((e) =>
        e.key.startsWith('conjugation:') && e.status === 'active' && e.errorCount > 1);
      if (!due) return null;
      const [verb, tense, personIdx] = due.key.slice('conjugation:'.length).split(':');
      return {
        id: due.id,
        concept: `conjugating ${verb} (${tense}${personIdx ? ` · ${personAt(Number(personIdx)) || ''}` : ''})`,
        label: due.label,
        type: 'grammar',
        mastery: 0,
        recurrence: due.recurrenceCount,
        errorCount: due.errorCount,
        personIndex: Number.isInteger(Number(personIdx)) && personIdx !== '' ? Number(personIdx) : null,
        source: 'learner-errors',
      };
    } catch { return null; }
  })();
  const dueLearnerErrors = getLearnerErrors({ limit: 12 });
  const dictationGap = (() => {
    const gap = dueLearnerErrors.find((e) =>
      e.key === 'dictation' && e.status === 'active' && e.errorCount > 1);
    return gap ? { id: gap.id, concept: 'Dictée listening accuracy', label: gap.label, type: 'listening', mastery: 0, recurrence: gap.recurrenceCount, source: 'learner-errors' } : null;
  })();
  // The accent repair retypes French accents (é/è/ç/œ) — French-authored
  // orthography, so it exists only under the writing-authored capability row.
  const pronunciationGap = !accentCap ? null : (() => {
    const gap = dueLearnerErrors.find((e) =>
      e.key === 'pronunciation' && e.status === 'active' && e.errorCount > 1);
    return gap ? { id: gap.id, concept: 'Pronunciation clarity', label: gap.label, type: 'pronunciation', mastery: 0, recurrence: gap.recurrenceCount, source: 'learner-errors' } : null;
  })();

  // Conservative per-type calibration from past selection trials; below the
  // sample floor this is a no-op and selection stays the urgency order.
  const calibration = calibrateSelection(getSelectionTrial(), graph);
  const drill = buildDrillSlot({
    balanced, calibration, trainerGap, dictationGap, pronunciationGap,
    dueRetestCandidates: dueRetests(graph, now, 3).map((n) => ({
      id: n.id, concept: n.concept, type: n.type,
      mastery: n.mastery, recurrence: n.recurrence, overdueBy: n.overdueBy,
    })),
  });
  const candidates = drill.candidates;
  const top = drill.top;

  const srs = getSrs();
  const library = [...entries, ...notebookAsEntries(getNotebook())];
  const srsDue = dueEntries(library, srs, now, { newCardCap: NEW_CARD_CAP }).length;
  const notebook = getErrorNotebook();
  const pendingRetypes = selectDueRetypes(notebook).length;
  const dayIndex = localDayIndex();
  const tracks = Array.isArray(listeningTracks) ? listeningTracks : [];
  const listeningTrack = tracks.length ? tracks[dayIndex % tracks.length] : null;
  const weakness = (() => { try { return getDueWeaknesses()[0] || null; } catch { return null; } })();
  const scenarios = scenariosReg;
  const suggested = scenarios.length ? scenarios[dayIndex % scenarios.length] : null;
  const rotationTopic = balancedDrillTopic(dayIndex);
  const hasAi = Boolean(apiKey) || Boolean(mockMode);
  const caps = probeCapabilities({
    hasAi,
    hasScenario: scenarios.length > 0,
    concept: balanced ? rotationTopic : (top?.concept || null),
    pendingRetypes,
    srsDue,
    listeningTrack: listeningTrack
      ? { id: listeningTrack.id, title: listeningTrack.title, audioSrc: listeningTrack.audioSrc || null, sourceType: listeningTrack.sourceType || 'tts' }
      : null,
    recentCorrections: selectCorrectedErrors(notebook, { since: now - 48 * 3600000 }).length,
    languageCaps: { conj: conjCap, authored: authoredCap, accent: accentCap },
  });
  const planBuilt = buildDailyCurriculum({
    minutes,
    srsDue,
    topMistake: top,
    pendingRetypes,
    recentCorrections: caps.recentCorrections,
    weaknessScenarioId: weakness?.scenarioId || null,
    suggestedScenarioId: suggested?.id || null,
    listeningTrack: listeningTrack
      ? { id: listeningTrack.id, title: listeningTrack.title, audioSrc: listeningTrack.audioSrc || null, sourceType: listeningTrack.sourceType || 'tts' }
      : null,
    dayIndex,
    balanced,
    balancedDrillTopic: balanced ? rotationTopic : null,
    skillNeeds: getSkillNeedsSafe(),
    evidenceDue: followUpDue,
  });
  const planResolved = resolvePlanCapabilities(planBuilt, caps);
  if (!planResolved.segments.length) return null;

  // Learner-facing explanation layer, frozen with the plan so the panel can
  // never drift from what was delivered. The balanced arm gets no weakness
  // panel: its drill is the rotation, and saying otherwise would be a lie.
  const drillSegForExplain = planResolved.segments.find((s) => s.id === 'drill');
  if (drillSegForExplain) {
    if (balanced) {
      drillSegForExplain.explain = null;
      drillSegForExplain.recovery = null;
    } else {
      drillSegForExplain.explain = segmentExplain({
        segId: 'drill',
        concept: top?.concept || null,
        drillKind: drillSegForExplain.payload?.kind || null,
        target: {
          errorCount: top?.errorCount ?? top?.recurrence ?? 0,
          overdueBy: top?.overdueBy ?? 0,
          modes: top?.modes,
        },
        fallbackWhy: drillSegForExplain.why || null,
      });
      const gapEntry = trainerGap || dictationGap || pronunciationGap;
      drillSegForExplain.recovery = top && gapEntry && top.id === gapEntry.id
        ? recoveryStatus(getLearnerErrors({ limit: 20 }).find((e) => e.id === top.id))
        : null;
    }
  }
  const reviewSegForExplain = planResolved.segments.find((s) => s.id === 'review');
  if (reviewSegForExplain) {
    reviewSegForExplain.explain = segmentExplain({
      segId: 'review',
      targeted: balanced ? false : caps.recentCorrections > 0,
      fallbackWhy: reviewSegForExplain.why || null,
    });
  }

  // Held-out measurement check: deterministic insertion at the END of the
  // session, measurement only, never practice, never mastery input.
  const today = new Date(now);
  const sDay = study ? studyApi.daySinceEnrolment(study, today) : null;
  const checkDue = study ? studyApi.isCheckScheduled(study, sDay) : false;
  let heldOut = null;
  if (checkDue) {
    try {
      const seenIds = new Set(
        getStudyChecksSafe().flatMap((c) => (c.items || []).map((it) => it.sourceItemId)),
      );
      const pool = studyApi.buildHeldOutPool({
        participantId: study.participantId,
        day: sDay,
        level: level || study.startLevel || 'B1',
        vocabEntries: entries,
        srsMap: getSrs(),
        listeningTracks: tracks,
        seenIds,
      });
      const existing = getStudyChecksSafe().find((c) => c.day === sDay && c.participantId === study.participantId);
      if (existing) {
        if (!existing.results) heldOut = existing;
      } else if (pool.words.length || pool.track) {
        const saved = studyApi.saveCheckRecord(studyApi.makeCheckRecord({
          participantId: study.participantId, day: sDay, level: level || study.startLevel || 'B1', pool,
        }));
        if (saved && !saved.results) heldOut = saved;
      }
    } catch { /* a broken check plan is no reason to lose the session */ }
  }

  const drillSeg = planResolved.segments.find((s) => s.id === 'drill');
  const trialDraft = {
    engineVersion: EVIDENCE_ENGINE_VERSION,
    candidates,
    selectedId: top?.id || null,
    selectedConcept: top?.concept || (balanced ? rotationTopic : null),
    activity: drillSeg?.payload?.kind || (planResolved.segments[0]?.id || null),
    masteryBefore: top?.mastery ?? null,
    recurrenceBefore: top?.recurrence ?? null,
    why: drillSeg?.why || '',
    segments: planResolved.segments.map((s) => ({ id: s.id, minutes: s.minutes })),
    variant,
    calibrationReady: Boolean(calibration.ready),
  };
  return {
    ...planResolved,
    study,
    heldOut,
    studyDay: sDay,
    trialDraft,
    trialGraph: graph,
    trialVariant: variant,
    degradedLearning,
    balanced,
  };
}

// Optional storage readers behind try/catch: a quota error in the study or
// placement stores must never take down the plan.
function getSkillNeedsSafe() {
  try {
    return getSkillNeeds() || getPlacementSkillNeeds();
  } catch { return null; }
}

function getStudyChecksSafe() {
  try { return getStudyChecks(); } catch { return []; }
}

// Evidence Study — FROZEN RESEARCH PROTOCOL (v1).
//
// Once real recruitment begins, nothing in this file changes silently: a
// methodology change means a protocolVersion bump, and every participant
// record records the version it was collected under so analyses never mix
// incompatible protocols. Items here are the pre-registered assumptions the
// rest of the study code MUST read instead of hard-coding its own numbers.
//
// Pre-registration principle: these values were fixed before recruitment;
// changing them after data collection starts invalidates the comparison.

export const PROTOCOL_VERSION = 1;
export const PROTOCOL_TITLE = 'Le Studio Evidence Study — adaptive vs balanced Today';

export const PROTOCOL = {
  version: PROTOCOL_VERSION,
  title: PROTOCOL_TITLE,

  // Assignment: deterministic hash of participantId (+ device sync id),
  // operator pin respected at enrolment only, locked for the study period.
  assignment: {
    algorithm: 'hash01(participantId|syncId) mod 2',
    lockedAtEnrolment: true,
    hiddenFromLearner: true,
    nonparticipantTreatment: 'adaptive',
  },

  // Primary outcome: delayed retention of targeted mistakes (1–3 day
  // window), participant-weighted. Secondary: 7+ day retention, held-out
  // transfer per skill, recurrence, completion.
  outcomes: {
    primary: 'delayedShort',
    primaryDefinition: 'proportion of eligible targeted selections with a correct first non-immediate retest 1–3 days after the selection',
    secondary: ['delayedLong', 'transfer', 'recurrence', 'completion'],
    immediateCountsAsEvidence: false,
  },

  // Delayed windows (days from the selection moment). Immediate retries are
  // rehearsal by definition and never evidence.
  delayedWindows: {
    immediate: { untilDays: 1 },
    short: { minDays: 1, maxDays: 3 },
    long: { minDays: 7, maxDays: null },
    immediateIsEvidence: false,
  },

  // Minimum samples: arm comparisons need participants, and every metric
  // keeps its own scored-participant floor. Nothing prints below a floor.
  minSamples: {
    participantsPerArm: 8,
    scoredParticipantsPerMetric: 5,
    heldOutItemsPerCheck: 3,
  },

  // Transfer: measurement-only held-out checks from the verified bank,
  // reported PER SKILL. No overall transfer score while per-skill banks are
  // small; combining requires a protocol change.
  transfer: {
    measurementOnly: true,
    excludedFromMastery: true,
    excludedFromSelection: true,
    reportedPerSkill: ['vocabulary', 'vocabulary-prod', 'grammar', 'listening', 'reading', 'speaking'],
    overallScoreAllowed: false,
  },

  // Exclusion rules (pre-registered so they cannot be tuned post hoc):
  exclusions: [
    'withdrawn participants stop contributing new data; pre-withdrawal rows stay analysable and flagged',
    'outcome rows without a participant id are excluded from analysis',
    'records whose treatmentConsistency.ok is false are excluded from arm comparisons',
    'ASR-uncertain observations never lower language mastery and never enter retention windows',
  ],

  // Study duration and schedule.
  duration: {
    defaultWeeks: 8,
    minWeeks: 4,
    maxWeeks: 26,
    firstCheckDay: 2,
    checkEveryDays: 3,
  },

  // Analysis method: participant is the independent unit.
  analysis: {
    unit: 'participant',
    aggregation: 'one contribution per participant per metric; arm mean/median/spread over participant estimates',
    pooledObservationRates: 'prohibited for arm comparisons',
    significanceClaims: 'not permitted; descriptive statistics only until a pre-registered repeated-measures analysis is added by a protocol change',
    missingData: 'reported per metric as scored-participant counts; never imputed',
  },

  // Held-out bank version in force (see heldOutBank.js HELDOUT_BANK_VERSION).
  heldOutBankVersion: 2,
};

/**
 * Protocol completeness check — the study may not collect data for an
 * enrolment whose protocol record is missing or incompatible.
 */
export function protocolCompatible(study) {
  if (!study || typeof study !== 'object') return { ok: false, reason: 'no study record' };
  const v = study.protocolVersion ?? (study.engineVersion === 1 ? 1 : null);
  if (!Number.isInteger(v)) return { ok: false, reason: 'no protocol version' };
  if (v > PROTOCOL_VERSION) return { ok: false, reason: `record protocol v${v} newer than app v${PROTOCOL_VERSION}` };
  return { ok: true, reason: null, version: v };
}

/** The protocol block attached to every exported participant. */
export function protocolRecord() {
  return {
    protocolVersion: PROTOCOL.version,
    title: PROTOCOL.title,
    assignment: PROTOCOL.assignment.algorithm,
    primaryOutcome: PROTOCOL.outcomes.primary,
    delayedWindows: PROTOCOL.delayedWindows,
    minSamples: PROTOCOL.minSamples,
    transfer: { measurementOnly: PROTOCOL.transfer.measurementOnly, reportedPerSkill: PROTOCOL.transfer.reportedPerSkill, overallScoreAllowed: PROTOCOL.transfer.overallScoreAllowed },
    exclusions: PROTOCOL.exclusions,
    durationWeeks: PROTOCOL.duration.defaultWeeks,
    analysisUnit: PROTOCOL.analysis.unit,
    heldOutBankVersion: PROTOCOL.heldOutBankVersion,
    engineVersion: 3, // mistake-graph evidence engine version in force
    frozen: true,
  };
}

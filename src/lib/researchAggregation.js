// Research aggregation layer — pools the LOCAL participant with IMPORTED
// study bundles so adaptive-vs-balanced comparisons run on the full dataset.
//
// Contract (tested):
//   · dedupe by participant id (first import wins; identical re-imports skip);
//   · validate schema + version, rejecting malformed or conflicting records;
//   · imported rows NEVER touch learner practice stores (read-only pooling);
//   · every pooled rate keeps its sample gate.

import { participantSummaries, armComparison, studyDeliveryStats, changeFromBaseline } from './evidenceStudy.js';
import { PROTOCOL_VERSION } from './studyProtocol.js';

export const POOL_SCHEMA_VERSION = 2;
const OUTCOME_SCHEMA_VERSION = 1;
const CHECK_SCHEMA_VERSION = 1;

function isValidStudyRecord(study) {
  if (!study || typeof study !== 'object') return false;
  if (typeof study.participantId !== 'string' || !study.participantId.startsWith('participant-')) return false;
  if (study.arm !== 'adaptive' && study.arm !== 'balanced') return false;
  if (typeof study.enrolledAt !== 'string' || Number.isNaN(Date.parse(study.enrolledAt))) return false;
  if (study.startLevel != null && !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(study.startLevel)) return false;
  if (study.startTheta != null) return false; // theta must be stripped at export
  // Protocol integrity: reject records from protocols this build cannot
  // interpret (missing version, or NEWER than this build's frozen protocol).
  // Older-but-known versions stay analysable and are tagged for the researcher.
  if (!Number.isInteger(study.protocolVersion)) return false;
  if (study.protocolVersion > PROTOCOL_VERSION) return false;
  return true;
}

function isValidOutcomeRow(o) {
  if (!o || typeof o !== 'object') return false;
  if (typeof o.id !== 'string' || !o.id) return false;
  if (o.variant !== 'adaptive' && o.variant !== 'balanced') return false;
  for (const key of ['immediate', 'delayedShort', 'delayedLong']) {
    const v = o[key];
    if (v != null && typeof v.correct !== 'boolean') return false;
  }
  if (o.transfer != null && (typeof o.transfer.score !== 'number' || o.transfer.score < 0 || o.transfer.score > 100)) return false;
  if (o.recurred != null && typeof o.recurred !== 'boolean') return false;
  return true;
}

function isValidCheckRecord(c) {
  if (!c || typeof c !== 'object') return false;
  if (typeof c.id !== 'string' || !c.id) return false;
  if (!Number.isFinite(Number(c.day))) return false;
  if (c.results != null) {
    if (typeof c.results.correct !== 'number' || typeof c.results.total !== 'number') return false;
  }
  return true;
}

/**
 * Validate an imported bundle's study streams. Returns { ok, errors, rows } —
 * rows only when ok. Conflicting records (same participant, different arm or
 * enrolment) are rejected outright.
 */
export function validateImportedBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') return { ok: false, errors: ['bundle is not an object'] };
  if (bundle.format !== 'le-studio.validation-study') errors.push('wrong format');
  if (bundle.version !== POOL_SCHEMA_VERSION) errors.push(`unsupported version ${bundle?.version}`);
  const study = bundle.study;
  if (!isValidStudyRecord(study)) errors.push('study record invalid');
  if (errors.length) return { ok: false, errors, rows: null };

  const outcomes = Array.isArray(bundle.studyOutcomes) ? bundle.studyOutcomes : [];
  const badOutcomes = outcomes.filter((o) => !isValidOutcomeRow(o)).length;
  if (badOutcomes) errors.push(`${badOutcomes} malformed outcome row(s)`);

  const checks = Array.isArray(bundle.studyChecks) ? bundle.studyChecks : [];
  const badChecks = checks.filter((c) => !isValidCheckRecord(c)).length;
  if (badChecks) errors.push(`${badChecks} malformed check record(s)`);

  if (errors.length) return { ok: false, errors, rows: null };
  const rows = outcomes.map((o) => ({ ...o, participantId: study.participantId, arm: study.arm }));
  return {
    ok: true,
    errors: [],
    rows,
    study: {
      participantId: study.participantId,
      arm: study.arm,
      startLevel: study.startLevel ?? null,
      enrolledAt: study.enrolledAt,
      status: study.status || 'active',
      weeks: study.weeks ?? null,
    },
    checks: checks.map((c) => ({ ...c, participantId: study.participantId })),
  };
}

/**
 * Pool the local participant with imported bundles.
 * `imports` = the researcher's imported-bundle store (validated here again).
 * Dedupe: one participant = one record; conflicting re-imports are rejected.
 */
export function poolStudyData({ localStudy = null, localOutcomes = [], imports = [] } = {}) {
  const participants = new Map();
  const participantsByArm = { adaptive: 0, balanced: 0 };

  if (localStudy?.participantId && isValidStudyRecord(localStudy)) {
    participants.set(localStudy.participantId, {
      ...localStudy,
      source: 'local',
      outcomes: (localOutcomes || []).filter((o) => isValidOutcomeRow(o)).map((o) => ({ ...o, participantId: localStudy.participantId, arm: localStudy.arm })),
      checks: [],
    });
  }

  const rejected = [];
  for (const raw of imports) {
    // Accept BOTH shapes: raw exported bundles and the stored import records
    // storage.getImportedStudyBundles() returns ({participantId, study,
    // outcomes, checks, importedAt}). Normalise to a bundle for validation.
    const imp = (raw && raw.study && !raw.format)
      ? {
          format: 'le-studio.validation-study',
          version: 2,
          study: raw.study,
          studyOutcomes: raw.outcomes || [],
          studyChecks: raw.checks || [],
        }
      : raw;
    const v = validateImportedBundle(imp);
    if (!v.ok) { rejected.push({ participantId: imp?.study?.participantId || '(unknown)', errors: v.errors }); continue; }
    const existing = participants.get(v.study.participantId);
    if (existing) {
      // Same participant twice: conflicting arms/enrolments are malformed.
      if (existing.arm !== v.study.arm || existing.enrolledAt !== v.study.enrolledAt) {
        rejected.push({ participantId: v.study.participantId, errors: ['conflicting duplicate import'] });
      }
      continue; // otherwise identical: dedupe
    }
    participants.set(v.study.participantId, { ...v.study, source: 'import', outcomes: v.rows, checks: v.checks });
  }

  const pooledOutcomes = [];
  for (const p of participants.values()) {
    participantsByArm[p.arm] = (participantsByArm[p.arm] || 0) + 1;
    pooledOutcomes.push(...p.outcomes);
  }

  // PARTICIPANT-level analysis: rows → participant summaries → arm gates on
  // participants. Session rows never inflate n. Baselines travel with each
  // participant record for change-from-baseline reporting.
  const studiesById = {};
  for (const p of participants.values()) {
    studiesById[p.participantId] = p;
  }
  const summaries = participantSummaries(pooledOutcomes);
  const baselineChanges = changeFromBaseline(summaries, { studiesById });

  return {
    participants: participants.size,
    participantsByArm,
    outcomes: pooledOutcomes,
    summaries,
    baselineChanges,
    rejected,
    comparison: armComparison(summaries),
    delivery: studyDeliveryStats(pooledOutcomes),
  };
}

export { OUTCOME_SCHEMA_VERSION, CHECK_SCHEMA_VERSION };

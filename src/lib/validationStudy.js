// Validation study — progress toward the externally-validated evidence base.
//
// The measurement infrastructure (placement, progression, corpora,
// comprehension, intelligibility, exams, assistance) only means something
// once real humans supply the other side. This module tracks how close each
// stream is to its study target and powers the Evidence-study dashboard.
//
// It deliberately contains NO data and NO way to synthesise entries: rows
// appear only through genuine human contribution (teacher entry, imports of
// genuinely collected bundles, real exam results).

// Study targets — the n each stream needs before its metric is publishable.
export const STUDY_TARGETS = {
  placement: { label: 'Placement vs known level', n: 100 },
  progression: { label: 'Held-out transfer checks', n: 100 },
  speakingCorpus: { label: 'Speaking recordings (AI-marked)', n: 300 },
  speakingDoubleMarked: { label: 'Speaking with 2+ human marks', n: 100 },
  writingCorpus: { label: 'Writing responses (AI-marked)', n: 300 },
  writingDoubleMarked: { label: 'Writing with 2 human markers', n: 100 },
  listening: { label: 'Listening app+human pairs', n: 200 },
  reading: { label: 'Reading app+human pairs', n: 200 },
  pronunciation: { label: 'Pronunciation benchmark samples', n: 200 },
  examinerMarks: { label: 'Examiner benchmark marks', n: 100 },
  realExamResults: { label: 'Real predicted-vs-returned grades', n: 100 },
};

const round = (v) => (Number.isFinite(v) ? Math.round(v) : 0);

/**
 * Progress rows for each evidence stream.
 * @param {{placements?:Array, progression?:Array, corpus?:Array,
 *   comprehension?:Array, benchmarks?:Array, examinerScripts?:Array,
 *   realExamResults?:Array}} stores
 */
export function studyProgress(stores = {}) {
  const corpus = Array.isArray(stores.corpus) ? stores.corpus : [];
  const speaking = corpus.filter((e) => e.mode === 'speaking');
  const writing = corpus.filter((e) => e.mode === 'writing');
  const comprehension = Array.isArray(stores.comprehension) ? stores.comprehension : [];
  const benchmarks = Array.isArray(stores.benchmarks) ? stores.benchmarks : [];
  const placements = Array.isArray(stores.placements) ? stores.placements : [];
  const progressions = Array.isArray(stores.progression) ? stores.progression : [];
  const examiner = Array.isArray(stores.examinerScripts) ? stores.examinerScripts : [];
  const realResults = Array.isArray(stores.realExamResults) ? stores.realExamResults : [];

  const rows = [
    { key: 'placement', n: placements.length },
    { key: 'progression', n: progressions.length },
    { key: 'speakingCorpus', n: speaking.length },
    { key: 'speakingDoubleMarked', n: speaking.filter((e) => e.doubleMarked).length },
    { key: 'writingCorpus', n: writing.length },
    { key: 'writingDoubleMarked', n: writing.filter((e) => e.doubleMarked).length },
    { key: 'listening', n: comprehension.filter((e) => e.skill === 'listening').length },
    { key: 'reading', n: comprehension.filter((e) => e.skill === 'reading').length },
    { key: 'pronunciation', n: benchmarks.length },
    { key: 'examinerMarks', n: examiner.length },
    { key: 'realExamResults', n: realResults.length },
  ].map(({ key, n }) => {
    const target = STUDY_TARGETS[key].n;
    return {
      key,
      label: STUDY_TARGETS[key].label,
      n: round(n),
      target,
      pct: Math.min(100, Math.round((n / target) * 100)),
      met: n >= target,
    };
  });

  const totalN = rows.reduce((a, r) => a + r.n, 0);
  const totalTarget = rows.reduce((a, r) => a + r.target, 0);
  return {
    rows,
    totalN,
    totalTarget,
    overallPct: Math.min(100, Math.round((totalN / totalTarget) * 100)),
    streamsMet: rows.filter((r) => r.met).length,
  };
}

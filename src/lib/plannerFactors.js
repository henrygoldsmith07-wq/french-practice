// Planner factor vocabulary: the names a scoring decision can carry, and the
// human-readable reason each one renders.
//
// WHY THIS IS ITS OWN MODULE
//     tests/module-boundaries caps sessionPlanner.js at 600 lines, and the
//     cap's message is "split the domain rather than pass the cap". This is a
//     genuine boundary: the vocabulary is pure data shared by the planner (which
//     sets factors) and the dev inspection surface (which explains them). The
//     planner is about sequencing; what a factor is CALLED is not.
//
// WHO SEES WHAT
//     These strings are the internal/dev inspection surface — what makes a
//     planner decision auditable ("why THIS segment, today?"). Learners only
//     ever see the concise copy in segmentExplain.js.

/** Named factors a candidate can accumulate. Stable strings, not display text. */
export const SCORE_FACTORS = Object.freeze({
  recurrence: 'recurrence',
  activeWeakness: 'active-weakness',
  dueRetest: 'due-retest',
  dueVocabulary: 'due-vocabulary',
  independenceGap: 'independence-gap',
  skillImbalance: 'skill-imbalance',
  goalAlignment: 'goal-alignment',
  transferDue: 'transfer-due',
  delayedDue: 'delayed-due',
  repetitionPenalty: 'repetition-penalty',
  easyWin: 'easy-win',
  fluencyBoost: 'fluency-boost',
  listeningStarved: 'listening-starved',
  speakingStarved: 'speaking-starved',
  examWeighting: 'exam-weighting',
});

/** Why a POSITIVE factor was applied, in the dev-inspection register. */
export const FACTOR_REASON = {
  [SCORE_FACTORS.recurrence]: 'has recurred after improving',
  [SCORE_FACTORS.activeWeakness]: 'is an open weakness in recent work',
  [SCORE_FACTORS.dueRetest]: 'a delayed retest is due on it',
  [SCORE_FACTORS.dueVocabulary]: 'vocabulary is due for recall',
  [SCORE_FACTORS.independenceGap]: 'has only been used correctly with help so far',
  [SCORE_FACTORS.skillImbalance]: 'the skill has fallen behind the others',
  [SCORE_FACTORS.goalAlignment]: 'matches what the learner said they want',
  [SCORE_FACTORS.transferDue]: 'is ready to be tested in a new situation',
  [SCORE_FACTORS.delayedDue]: 'is due for a check after the delay',
  [SCORE_FACTORS.easyWin]: 'easy material for fluency and confidence',
  [SCORE_FACTORS.fluencyBoost]: 'a confidence-building win is due',
  [SCORE_FACTORS.listeningStarved]: 'listening practice has been quiet lately',
  [SCORE_FACTORS.speakingStarved]: 'speaking time has been low lately',
  [SCORE_FACTORS.examWeighting]: "the learner's exam weights this heavily",
};

/** Why a NEGATIVE factor was applied. */
export const FACTOR_PENALTY = {
  [SCORE_FACTORS.repetitionPenalty]: 'the same mode or target was used recently',
};

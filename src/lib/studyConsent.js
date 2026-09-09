// Evidence Study consent — recorded SEPARATELY from study state and
// outcomes, so a participant record can never exist without an explicit,
// informed "yes", and withdrawing the study never silently rewrites the
// consent trail.
//
// states:
//   null   never asked (or record cleared)
//   declined  the learner saw the explanation and said no — MUST NOT nag on
//             every Today open; a re-invitation may be surfaced once from
//             the study panel only
//   accepted  consented at; enrolment may create the participant record

export const CONSENT_VERSION = 1; // bump when the study protocol changes materially

export const CONSENT_POINTS = [
  { title: 'What is collected', body: 'Assigned activities, session timing and completion, delayed retest outcomes (1–3 and 7+ days), held-out check scores, hint usage and mistake recurrence.' },
  { title: 'Why', body: 'To compare the adaptive Today loop against an equivalent balanced curriculum on real learning outcomes — delayed retention and transfer, not engagement.' },
  { title: 'Hidden assignment', body: 'You are deterministically assigned to one of two arms for the whole study. Which arm stays hidden, even from this panel.' },
  { title: 'Optional', body: 'Everything in Le Studio works normally without joining. Joining only adds occasional brief held-out checks at the end of a Today session.' },
  { title: 'Withdraw anytime', body: 'You can withdraw and delete all study data at any time. Practice history (XP, reviews, mistakes) is yours and is never touched.' },
  { title: 'Local-first', body: 'Study data stays on this device until you explicitly export a bundle. Bundles carry an anonymous participant id only.' },
];

export function makeConsentRecord({ decision, now = Date.now(), version = CONSENT_VERSION } = {}) {
  if (decision !== 'accepted' && decision !== 'declined') return null;
  return { decision, at: new Date(now).toISOString(), version };
}

/** The single question the rest of the app asks: may we enrol? */
export function mayEnrol(consent, studyState) {
  return consent?.decision === 'accepted'
    && (studyState == null || studyState.status === 'active' || studyState.status === 'withdrawn');
}

/** Has the learner seen the explanation and refused? */
export function hasDeclined(consent) {
  return consent?.decision === 'declined';
}

/**
 * THE central research-write guard — pure, dependency-free core so both
 * studyFlow.js and storage.js can enforce it (storage cannot import
 * studyFlow without a cycle).
 *
 * True only when ALL hold:
 *   · consent decision is 'accepted';
 *   · study status is 'active';
 *   · a participant id exists;
 *   · the study arm is valid.
 * A failing guard means "return without touching any fp.study.* data" —
 * normal adaptive practice is never affected either way.
 */
export function consentGuardOk(consent, study) {
  try {
    if (consent?.decision !== 'accepted') return false;
    if (!study || study.status !== 'active') return false;
    if (typeof study.participantId !== 'string' || !study.participantId.startsWith('participant-')) return false;
    if (study.arm !== 'adaptive' && study.arm !== 'balanced') return false;
    return true;
  } catch {
    return false;
  }
}

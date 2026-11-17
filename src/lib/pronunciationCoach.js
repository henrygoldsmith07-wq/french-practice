// Pure, deterministic comparison for the guided pronunciation practice demo.
//
// This deliberately does NOT produce a "pronunciation score". It only reports
// which words of the target phrase the browser's speech recognizer actually
// heard. Keeping it framework-free lets it be unit-tested with plain
// `node --test` (a .jsx module can't be imported without the JSX transform).

// Normalize for spoken comparison: NFC composition so decomposed accents
// compare equal, lowercase, strip punctuation, keep letters/digits/'/-.
const normalizeWords = (text) =>
  String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Compare a target phrase with a speech-recognition transcript.
 *
 * Returns only facts derivable from the two strings:
 *  - available: whether a non-empty transcript was captured
 *  - heard: the raw transcript (so the UI can show what was recognised)
 *  - targetWords / spokenWords: normalized token arrays
 *  - hits: which target words appear, in order, in the transcript (LCS)
 *  - matched / total: a word-match COUNT, never a fabricated grade
 *  - recognisedPercent: matched / total * 100, capped at 100 by construction;
 *    "words recognised", not "pronunciation accuracy"
 *
 * No randomness, no phoneme claims, no provider dependency.
 */
export function compareTranscript(target, spoken) {
  const targetWords = normalizeWords(target);
  const spokenWords = normalizeWords(spoken);
  const available = spokenWords.length > 0;

  const m = targetWords.length;
  const n = spokenWords.length;

  // Longest-common-subsequence alignment: the maximum number of target words
  // that appear, in order, in the transcript. Alignment (rather than index
  // comparison) means an inserted word early on can't be credited to the
  // wrong target word.
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = targetWords[i] === spokenWords[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hits = new Array(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (targetWords[i] === spokenWords[j]) {
      hits[i] = true;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  const matchedWords = targetWords.filter((_, idx) => hits[idx]);
  const missedWords = targetWords.filter((_, idx) => !hits[idx]);
  const matched = matchedWords.length;
  const total = targetWords.length;
  const recognisedPercent = total === 0 ? 0 : Math.round((matched / total) * 100);

  return {
    available,
    heard: String(spoken ?? ''),
    targetWords,
    spokenWords,
    hits,
    matchedWords,
    missedWords,
    matched,
    total,
    recognisedPercent,
  };
}

export default compareTranscript;

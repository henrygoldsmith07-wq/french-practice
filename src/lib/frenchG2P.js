// French grapheme→phoneme analysis of the TARGET sentence (the text the
// learner was asked to read). Deterministic and offline: this is what lets
// pronunciation scoring talk about /y/, nasals, liaison and silent endings
// instead of only about words Whisper happened to recognise.
//
// It is an approximation — French orthography has genuine ambiguities
// («enfants» vs «menu»), and no dictionary is shipped. Where a rule is a
// simplification, the caller sees phoneme CLASSES, not IPA claims.

const VOWEL_PHONEMES = new Set(['a', 'e', 'ɛ', 'i', 'o', 'ɔ', 'u', 'y', 'ə', 'ø', 'œ', 'ɑ̃', 'ɔ̃', 'ɛ̃']);

// Longest-match grapheme rules. Order matters: multi-letter first.
const GRAPHEMES = [
  ['eaux', 'o'], ['eau', 'o'], ['aux', 'o'], ['au', 'o'],
  ['aim', 'ɛ̃'], ['ain', 'ɛ̃'], ['ein', 'ɛ̃'], ['in', 'ɛ̃'], ['im', 'ɛ̃'], ['un', 'ɛ̃'], ['yn', 'ɛ̃'],
  ['en', 'ɑ̃'], ['an', 'ɑ̃'], ['em', 'ɑ̃'], ['am', 'ɑ̃'],
  ['on', 'ɔ̃'], ['om', 'ɔ̃'],
  ['ou', 'u'], ['oi', 'wa'], ['œu', 'œ'], ['eu', 'ø'], ['œ', 'œ'],
  ['ill', 'j'], ['gn', 'ɲ'], ['ch', 'ʃ'], ['ph', 'f'], ['qu', 'k'], ['gu', 'g'],
  ['é', 'e'], ['è', 'ɛ'], ['ê', 'ɛ'], ['ë', 'ɛ'], ['â', 'a'], ['î', 'i'], ['ô', 'o'], ['û', 'y'], ['ù', 'y'], ['ç', 's'],
  ['ai', 'ɛ'], ['ei', 'ɛ'], ['er$z', null], // placeholder, handled at word level
  ['u', 'y'], ['i', 'i'], ['e', 'ə'], ['a', 'a'], ['o', 'o'],
  ['b', 'b'], ['c', 'k'], ['d', 'd'], ['f', 'f'], ['g', 'g'], ['h', null],
  ['j', 'ʒ'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'],
  ['p', 'p'], ['q', 'k'], ['r', 'ʁ'], ['s', 's'], ['t', 't'],
  ['v', 'v'], ['w', 'w'], ['x', 'ks'], ['y', 'i'], ['z', 'z'],
];

// Words whose final «ent» IS pronounced (nouns/adverbs), a small honest
// exception list — the default rule (3rd-person plural verb ending) strips it.
const ENT_PRONOUNCED = new Set(['vent', 'avant', 'temps', 'dent', 'lent', 'often', 'comment', 'vraiment', 'laidement', 'évidemment', 'assurement', 'soudainement']);

function wordToPhonemes(word) {
  let w = word.toLowerCase();
  // Elision: l'homme → homme (the article's phoneme is a vowel and links).
  w = w.replace(/^l['’]/, '').replace(/^d['’]/, '').replace(/^n['’]/, '').replace(/^s['’]/, '').replace(/^j['’]/, '').replace(/^qu['’]/, 'k');
  // Silent plural/verb ending «ent» (approximation; exception list above).
  let silentEnding = false;
  let finalElidable = null; // the consonant that would surface in liaison
  if (w.length > 3 && w.endsWith('ent') && !ENT_PRONOUNCED.has(w)) {
    finalElidable = 't'; // 3pl -ent links as /t/ (ils chantent_ensemble)
    w = w.slice(0, -3);
    silentEnding = true;
  } else if (w.length > 2 && ENT_PRONOUNCED.has(w) === false && /[stzdx]$/.test(w) && !/[aeiouyéèêàâ]$/.test(w)) {
    // Common silent final consonants (plural s, past-participle d/t/x).
    finalElidable = w.slice(-1);
    w = w.slice(0, -1);
    silentEnding = true;
  }
  const phonemes = [];
  let i = 0;
  let nasals = 0, yCount = 0, uCount = 0, rCount = 0;
  while (i < w.length) {
    let matched = null;
    for (const [graph, ph] of GRAPHEMES) {
      const g = graph.replace(/\$$/, '');
      if (graph.endsWith('$') && !w.endsWith(g)) continue;
      if (w.startsWith(g, i)) { matched = [g, ph]; break; }
    }
    if (!matched) { i += 1; continue; }
    const [g, ph] = matched;
    i += g.length;
    if (ph == null) continue; // silent h / stripped
    phonemes.push(ph);
    if (ph === 'ɑ̃' || ph === 'ɔ̃' || ph === 'ɛ̃') nasals += 1;
    if (ph === 'y') yCount += 1;
    if (ph === 'u') uCount += 1;
    if (ph === 'ʁ') rCount += 1;
  }
  return { phonemes, nasals, yCount, uCount, rCount, silentEnding, finalElidable };
}

/** Full analysis of a target sentence. */
export function analyzeFrenchText(sentence) {
  const words = String(sentence || '')
    .toLowerCase()
    .replace(/[^a-zà-ÿ'’\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['au', 'aux', 'et'].includes(w) || true)
    .filter(Boolean);
  const perWord = [];
  let nasals = 0, yCount = 0, uCount = 0, rCount = 0, silentEndings = 0;
  let syllables = 0;
  let liaisonOpportunities = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^-+|-+$/g, '');
    if (!w) continue;
    const analysis = wordToPhonemes(w);
    perWord.push({ word: w, ...analysis });
    nasals += analysis.nasals;
    yCount += analysis.yCount;
    uCount += analysis.uCount;
    rCount += analysis.rCount;
    if (analysis.silentEnding) silentEndings += 1;
    syllables += analysis.phonemes.filter((p) => VOWEL_PHONEMES.has(p)).length;
    // Liaison/enchaînement opportunity: the word carries an elidable final
    // consonant (silent before a pause) and the next word begins with a
    // vowel sound (or h muet — h never surfaces).
    const next = words[i + 1];
    if (next && /^[aeiouyéèêàâîôûœh]/.test(next) && analysis.finalElidable) {
      liaisonOpportunities += 1;
    }
  }
  return {
    words: perWord,
    syllables,
    counts: { nasals, y: yCount, u: uCount, r: rCount },
    liaisonOpportunities,
    silentEndings,
    has: (kind) => {
      if (kind === 'nasal') return nasals > 0;
      if (kind === 'y') return yCount > 0;
      if (kind === 'u') return uCount > 0;
      if (kind === 'r') return rCount > 0;
      if (kind === 'liaison') return liaisonOpportunities > 0;
      return false;
    },
  };
}

/** Share of the phoneme string that is voiced (vowels + voiced consonants). */
const VOICED = new Set([...VOWEL_PHONEMES, 'b', 'd', 'g', 'v', 'z', 'ʒ', 'm', 'n', 'ɲ', 'l', 'ʁ']);
export function voicedShare(analysis) {
  const all = analysis.words.flatMap((w) => w.phonemes);
  if (!all.length) return 0.6; // neutral prior
  return all.filter((p) => VOICED.has(p)).length / all.length;
}

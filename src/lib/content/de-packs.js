// German registry: composes ALL German packs on demand. Importing this module
// (dynamically) is the ONLY way German packs enter the bundle graph — the
// German themed packs and its frequency dictionary share one lazy chunk, and
// it is only fetched when the learner actually studies German.

import { DE_VOCAB_PACKS } from './de-vocab.js';
import { getFrequencyPacksFor, dropThemedDuplicates } from '../vocab-frequency.js';

export function getDePacks() {
  // Themed first: it owns the head-words it teaches with an example sentence,
  // so the bare frequency copy of the same word is dropped rather than shipped
  // as a second, weaker card.
  return getFrequencyPacksFor('de').then((freq) => [
    ...DE_VOCAB_PACKS,
    ...dropThemedDuplicates(DE_VOCAB_PACKS, freq, 'de'),
  ]);
}
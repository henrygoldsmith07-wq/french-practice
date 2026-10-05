// Spanish registry: composes ALL Spanish packs on demand. Importing this
// module (dynamically) is the ONLY way Spanish packs enter the bundle graph —
// the Spanish themed packs and its frequency dictionary share one lazy chunk,
// and it is only fetched when the learner actually studies Spanish.

import { ES_VOCAB_PACKS } from './es-vocab.js';
import { getFrequencyPacksFor, dropThemedDuplicates } from '../vocab-frequency.js';

export function getEsPacks() {
  // Themed first: it owns the head-words it teaches with an example sentence,
  // so the bare frequency copy of the same word is dropped rather than shipped
  // as a second, weaker card.
  return getFrequencyPacksFor('es').then((freq) => [
    ...ES_VOCAB_PACKS,
    ...dropThemedDuplicates(ES_VOCAB_PACKS, freq, 'es'),
  ]);
}

// Spanish registry: composes ALL Spanish packs on demand. Importing this
// module (dynamically) is the ONLY way Spanish packs enter the bundle graph —
// the Spanish themed packs and its frequency dictionary share one lazy chunk,
// and it is only fetched when the learner actually studies Spanish.

import { ES_VOCAB_PACKS } from './es-vocab.js';
import { getFrequencyPacksFor } from '../vocab-frequency.js';

export function getEsPacks() {
  return getFrequencyPacksFor('es').then((freq) => [...ES_VOCAB_PACKS, ...freq]);
}

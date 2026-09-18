// German registry: composes ALL German packs on demand. Importing this module
// (dynamically) is the ONLY way German packs enter the bundle graph — the
// German themed packs and its frequency dictionary share one lazy chunk, and
// it is only fetched when the learner actually studies German.

import { DE_VOCAB_PACKS } from './de-vocab.js';
import { getFrequencyPacksFor } from '../vocab-frequency.js';

export function getDePacks() {
  return getFrequencyPacksFor('de').then((freq) => [...DE_VOCAB_PACKS, ...freq]);
}

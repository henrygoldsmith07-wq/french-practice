// Progress-card store — the cards a learner has saved from the Share screen.
//
// The Share panel kept its card library in a raw component-level localStorage
// key. Like every other learner record it now lives behind storageCore, so
// it is learner-routed (a household does not share one card library) and
// travels with the rest of the progress in an export.
//
// Components never touch browser storage directly — see the storage-boundary
// test.
import { read, write, KEYS } from '../storageCore.js';

const MAX_CARDS = 12; // a card library is not an archive

export const getProgressCards = () => {
  const raw = read(KEYS.progressCards, []);
  return Array.isArray(raw) ? raw : [];
};

export const saveProgressCards = (cards) =>
  write(KEYS.progressCards, (Array.isArray(cards) ? cards : []).slice(0, MAX_CARDS));

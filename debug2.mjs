import { analyzeFrenchText } from './src/lib/frenchG2P.js';
for (const word of ['trois', 'ils', 'chansons', 'vent', 'troi', 'troiss']) {
  const r = analyzeFrenchText(word);
  console.log(word, '->', JSON.stringify(r.words[0]?.phonemes), 'silent:', r.words[0]?.silentEnding);
}

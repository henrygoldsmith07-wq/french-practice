// Dictation progression: five levels. One sentence from the shared pool is
// played at every level — the content is identical; what ramps is the TTS
// playback speed and the diacritic strictness of the grading.
//
// The audio is always synthesized speech, never a human recording. These
// labels deliberately describe only what the code actually varies. An earlier
// version advertised "Word / Chunk / Sentence / Paragraph / Authentic" content
// tiers, but the drill always played one arbitrary sentence from the shared
// pool: those tiers were never delivered. "Authentic / natural speech" was
// also a provenance claim the app does not make anywhere else for TTS audio.

export const DICTATION_LEVELS = [
  { id: 1, label: 'Slow', hint: 'One sentence, slow synthesized speech' },
  { id: 2, label: 'Easy', hint: 'Same sentence pool, easy pace' },
  { id: 3, label: 'Steady', hint: 'Same sentence pool, steady pace' },
  { id: 4, label: 'Quick', hint: 'Same sentence pool, quick pace' },
  { id: 5, label: 'Fast', hint: 'Same sentence pool, fast synthesized speech' },
];

export function levelForSrs(srs){
  const learned = Object.values(srs).filter(s=> (s.reps||0)>=2).length;
  if(learned < 8) return 1;
  if(learned < 20) return 2;
  if(learned < 40) return 3;
  if(learned < 80) return 4;
  return 5;
}

export function dictationSpeed(level){
  return level <=2 ? 0.75 : level===3 ? 0.9 : level===4 ? 1.0 : 1.05;
}

export function diacriticStrict(level){
  return level >= 4;
}

/**
 * Seed catalog of REAL public-domain French recordings.
 *
 * Every entry points at Internet Archive items whose metadata was checked by
 * hand (Public Domain Mark 1.0, LibriVox project, named volunteer readers).
 * Audio is STREAMED from archive.org — nothing is committed here, and the
 * pack importer can localize files into /audio/ for offline use.
 *
 * What we deliberately DO NOT claim: a reader's exact region, age or gender
 * unless the upstream metadata states it. Absent fields stay absent.
 */

export const AUTHENTIC_AUDIO_SEED = [
  {
    id: 'lv-claude-gueux-hugo',
    title: 'Claude Gueux (Victor Hugo) — LibriVox',
    kind: 'authentique',
    cefr: 'B2',
    license: 'public-domain',
    consentBasis: 'public-domain-recording',
    sourceUrl: 'https://archive.org/details/claude_gueux_1902_librivox',
    audioSrc: 'https://archive.org/download/claude_gueux_1902_librivox/ClaudeGueux_librivox.m4b',
    speakers: ['Zeckou', 'Martine', 'Laurette', 'Margot', 'Christiane Jehanne'],
    register: 'natural-read',
    noise: 'quiet',
    format: 'm4b',
    notes: 'Multiple volunteer readers → natural speaker variation within one item.',
  },
  {
    id: 'lv-quarante-fauteuils',
    title: 'Les quarante fauteuils de l’Académie Française (Barthélemy) — LibriVox',
    kind: 'authentique',
    cefr: 'C1',
    license: 'public-domain',
    consentBasis: 'public-domain-recording',
    sourceUrl: 'https://archive.org/details/quarante_fauteuils_academie_francaise_2009_librivox',
    audioSrc: 'https://archive.org/download/quarante_fauteuils_academie_francaise_2009_librivox/QuareanteFauteuils_librivox.m4b',
    speakers: ['Isad', 'Christiane Jehanne', 'Stéphanie', 'Dominique Ducamus', 'Rémi', 'Margot', 'Kazbek', 'Kamisole'],
    register: 'clear-read',
    noise: 'quiet',
    format: 'm4b',
    notes: 'Eight readers; short biographical chapters suit excerpted listening.',
  },
];

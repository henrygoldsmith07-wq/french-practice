import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIELD_NOTE_STAGES,
  addFieldNote,
  fieldNoteStats,
  nextFieldNote,
  practiceFieldNote,
} from '../src/lib/fieldNotes.js';

const NOW = Date.parse('2026-08-27T09:00:00.000Z');

test('field notes capture a phrase once and keep its real-world context', () => {
  const first = addFieldNote([], {
    id: 'note-1',
    french: '  J’ai besoin d’un coup de main.  ',
    meaning: 'I need a hand.',
    context: 'work',
    source: 'team chat',
  }, NOW);

  assert.equal(first.added, true);
  assert.equal(first.note.french, 'J’ai besoin d’un coup de main.');
  assert.equal(first.note.context, 'work');
  assert.equal(first.note.stage, 0);

  const duplicate = addFieldNote(first.notes, { french: 'J’ai besoin d’un coup de main !', context: 'message' }, NOW + 1000);
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.notes.length, 1);
});

test('a successful rep earns one rung at a time, while a slip preserves progress', () => {
  let notes = addFieldNote([], { id: 'note-2', french: 'On se tient au courant.', meaning: 'Keep me posted.' }, NOW).notes;
  notes = practiceFieldNote(notes, 'note-2', { mode: 'rehearse' }, NOW);
  assert.equal(notes[0].stage, 1);
  notes = practiceFieldNote(notes, 'note-2', { mode: 'delayed' }, NOW + 4 * 86400000);
  assert.equal(notes[0].stage, 2);

  notes = practiceFieldNote(notes, 'note-2', { outcome: 'slip', mode: 'new-context' }, NOW + 5 * 86400000);
  assert.equal(notes[0].stage, 2);
  assert.equal(notes[0].slips, 1);
  assert.equal(new Date(notes[0].nextReviewAt).getTime(), NOW + 5 * 86400000);

  notes = practiceFieldNote(notes, 'note-2', { mode: 'new-context', variant: 'On se tient au courant demain.' }, NOW + 6 * 86400000);
  assert.equal(notes[0].stage, 3);
  assert.equal(notes[0].lastVariant, 'On se tient au courant demain.');
  assert.equal(notes[0].attempts.length, 4);
});

test('stats and queue put due, unfinished notes first', () => {
  let notes = addFieldNote([], { id: 'finished', french: 'C’est parti.', meaning: 'Here we go.' }, NOW).notes;
  notes = practiceFieldNote(notes, 'finished', {}, NOW);
  notes = practiceFieldNote(notes, 'finished', {}, NOW + 2 * 86400000);
  notes = practiceFieldNote(notes, 'finished', {}, NOW + 6 * 86400000);

  notes = addFieldNote(notes, { id: 'new', french: 'Ça marche.', meaning: 'That works.' }, NOW + 7 * 86400000).notes;
  const stats = fieldNoteStats(notes, NOW + 7 * 86400000);
  assert.equal(stats.total, 2);
  assert.equal(stats.captured, 1);
  assert.equal(stats.reused, 1);
  assert.equal(stats.due, 1);
  assert.equal(nextFieldNote(notes, NOW + 7 * 86400000).id, 'new');
  assert.deepEqual(FIELD_NOTE_STAGES.map((stage) => stage.id), ['captured', 'rehearsed', 'recalled', 'reused']);
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateFieldNoteActivities, dueFieldNoteActivities, activityLabel, ACTIVITY_TYPES,
} from '../src/lib/fieldNotesActivities.js';

const NOW = Date.now();

const note = (over = {}) => ({
  id: 'field:1',
  french: 'Ça dépend.',
  meaning: 'It depends.',
  context: 'message',
  source: 'a friend’s text',
  stage: 1,
  attempts: [],
  successes: 1,
  slips: 0,
  lastOutcome: 'success',
  createdAt: new Date(NOW - 3 * 86400000).toISOString(),
  nextReviewAt: new Date(NOW - 86400000).toISOString(),
  ...over,
});

describe('field note activities', () => {
  it('covers the full practice set for a saved phrase', () => {
    const activities = generateFieldNoteActivities(note());
    const types = activities.map((a) => a.type);
    for (const type of ACTIVITY_TYPES) assert.ok(types.includes(type), `missing activity ${type}`);
    assert.equal(activities.length, ACTIVITY_TYPES.length);
  });

  it('uses the learner’s own phrase and meaning — never invented', () => {
    const activities = generateFieldNoteActivities(note());
    for (const a of activities) {
      const text = `${a.prompt} ${a.answer} ${a.hint || ''}`;
      assert.ok(text.includes('Ça dépend.') || text.includes('It depends.') || a.type === 'completion', `activity ${a.type} uses the note`);
    }
  });

  it('the speaking prompt is the product-spec example shape', () => {
    const activities = generateFieldNoteActivities(note());
    const speaking = activities.find((a) => a.type === 'speaking');
    assert.ok(speaking.prompt.toLowerCase().includes('friend asks whether you want to go out this weekend'));
  });

  it('fresh-context usage differs from the saved context', () => {
    const activities = generateFieldNoteActivities(note({ context: 'message' }));
    const fresh = activities.find((a) => a.type === 'fresh-context');
    assert.ok(!fresh.prompt.includes('message'), 'fresh prompt must not reuse the saved context');
    assert.ok(fresh.prompt.includes('new situation'));
    assert.ok(fresh.display.freshContext.length > 0);
    // The street note must not produce a street-flavoured fresh context.
    const street = generateFieldNoteActivities(note({ context: 'street' })).find((a) => a.type === 'fresh-context');
    assert.ok(!street.prompt.includes('a sign, menu or shop'));
  });

  it('activities are deterministic for one note', () => {
    const first = generateFieldNoteActivities(note());
    const second = generateFieldNoteActivities(note());
    assert.deepEqual(first.map((a) => a.id), second.map((a) => a.id));
    assert.deepEqual(first.map((a) => a.prompt), second.map((a) => a.prompt));
  });

  it('excludeTypes drops a repeated shape', () => {
    const activities = generateFieldNoteActivities(note(), { excludeTypes: ['speaking'] });
    assert.ok(!activities.some((a) => a.type === 'speaking'));
    assert.equal(activities.length, ACTIVITY_TYPES.length - 1);
  });

  it('labels are plain learner language', () => {
    for (const type of ACTIVITY_TYPES) {
      const label = activityLabel(type);
      assert.ok(label.length > 3);
      for (const bad of ['fsrs', 'srs', 'evidence', 'metadata', 'engine']) {
        assert.ok(!label.toLowerCase().includes(bad), `label leaks "${bad}"`);
      }
    }
  });

  it('the due queue respects spacing and interleaves types', () => {
    const overdue = note();
    const future = note({ id: 'field:2', french: 'N’importe quoi.', nextReviewAt: new Date(NOW + 86400000).toISOString() });
    const queue = dueFieldNoteActivities([overdue, future], NOW, 6, { lastTypeByNote: { 'field:1': 'speaking' } });
    assert.equal(queue.length, 1, 'only the overdue note is due');
    assert.equal(queue[0].note.id, 'field:1');
    assert.notEqual(queue[0].activity.type, 'speaking', 'never the same type twice running');
  });

  it('excludes phrases the learner just practised', () => {
    const queue = dueFieldNoteActivities([note()], NOW, 6, { excludePhrases: ['ça dépend.'] });
    assert.equal(queue.length, 0);
  });

  it('empty input yields an empty queue, never a throw', () => {
    assert.deepEqual(generateFieldNoteActivities(null), []);
    assert.deepEqual(dueFieldNoteActivities([], NOW), []);
    assert.deepEqual(dueFieldNoteActivities(null, NOW), []);
  });
});

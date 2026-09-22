import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveListeningTrack } from '../src/lib/listeningAsync.js';

test('listening fallback distinguishes loading from a genuinely missing track', () => {
  assert.deepEqual(resolveListeningTrack(null, 'track-1'), {
    status: 'loading',
    track: null,
  });

  assert.deepEqual(resolveListeningTrack([], 'track-1'), {
    status: 'missing',
    track: null,
  });

  const track = { id: 'track-1', title: 'Au marché' };
  assert.deepEqual(resolveListeningTrack([track], 'track-1'), {
    status: 'ready',
    track,
  });
});

test('listening fallback treats an unknown id as missing only after the library resolves', () => {
  const tracks = [{ id: 'known', title: 'Known track' }];
  assert.deepEqual(resolveListeningTrack(tracks, 'unknown'), {
    status: 'missing',
    track: null,
  });
});

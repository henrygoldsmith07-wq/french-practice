import assert from 'node:assert/strict';
import { test } from 'node:test';
import { speakLines, speakSegment } from '../src/lib/tts.js';

// ttsSupported() lives in tts.js itself and reads `window` at call time, so the
// cleanest seam is the `window` global: absent => no speech engine; present with
// a speechSynthesis stub => supported, which lets the empty-input branch of each
// early return be exercised on its own.
function setWindow(value) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previous = globalThis.window;
  if (value === null) delete globalThis.window;
  else globalThis.window = value;
  return () => {
    if (had) globalThis.window = previous;
    else delete globalThis.window;
  };
}

const supportedWindow = () => ({
  speechSynthesis: {
    getVoices: () => [],
    cancel() {},
    speak() {},
  },
});

async function assertOnEndFiredAsync(invoke) {
  let phase = 'sync';
  let syncCalls = 0;
  let asyncCalls = 0;
  let fired;
  const done = new Promise((resolve) => { fired = resolve; });
  const onEnd = () => {
    if (phase === 'sync') syncCalls += 1;
    else asyncCalls += 1;
    fired();
  };

  invoke(onEnd);
  phase = 'async'; // a synchronous onEnd would have been counted in `syncCalls`

  let timer;
  try {
    await Promise.race([
      done,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('onEnd was never called')), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }

  assert.equal(syncCalls, 0, 'onEnd must not be called synchronously');
  assert.ok(asyncCalls >= 1, 'onEnd must be called asynchronously');
}

test('speakLines calls onEnd asynchronously when TTS is unsupported', async () => {
  const restore = setWindow(null);
  try {
    await assertOnEndFiredAsync((onEnd) => speakLines([{ fr: 'Bonjour' }], { onEnd }));
  } finally {
    restore();
  }
});

test('speakSegment calls onEnd asynchronously when TTS is unsupported', async () => {
  const restore = setWindow(null);
  try {
    await assertOnEndFiredAsync((onEnd) => speakSegment('Bonjour', { onEnd }));
  } finally {
    restore();
  }
});

test('speakLines calls onEnd asynchronously when the lines array is empty', async () => {
  const restore = setWindow(supportedWindow());
  try {
    await assertOnEndFiredAsync((onEnd) => speakLines([], { onEnd }));
  } finally {
    restore();
  }
});

test('speakSegment calls onEnd asynchronously when the text is empty', async () => {
  const restore = setWindow(supportedWindow());
  try {
    await assertOnEndFiredAsync((onEnd) => speakSegment('', { onEnd }));
  } finally {
    restore();
  }
});

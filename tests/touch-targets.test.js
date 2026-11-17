// Design-system guard: dismiss/close controls must have a 44px hit area so
// they are comfortably tappable one-handed on a phone, while their SVG icons
// stay at their original size. These buttons live inside heavy screens (App,
// TodaySession), so the guard reads the rendered markup source directly and
// asserts the class list of the specific aria-labelled control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

function buttonClass(source, ariaLabel) {
  // Locate the label, then expand to the enclosing <button ...> opening tag.
  // More robust than one big regex over JSX attribute permutations.
  const at = source.indexOf(`aria-label="${ariaLabel}"`);
  assert.ok(at >= 0, `button labelled "${ariaLabel}" not found in source`);
  const start = source.lastIndexOf('<button', at);
  const end = source.indexOf('>', at);
  assert.ok(start >= 0 && end > at, `no enclosing button tag for "${ariaLabel}"`);
  const tag = source.slice(start, end + 1);
  const cls = tag.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
  assert.ok(cls, `button labelled "${ariaLabel}" has no className`);
  return cls[1] ?? cls[2] ?? '';
}

const cases = [
  ['src/App.jsx', 'Dismiss install banner'],
  ['src/App.jsx', 'Close learning path'],
  ['src/components/TodaySession.jsx', "End today's session"],
  ['src/components/GlobalSearch.jsx', 'Close search'],
];

for (const [file, label] of cases) {
  test(`${label} has a 44px touch target`, () => {
    const cls = buttonClass(read(file), label);
    assert.match(cls, /min-h-11/, 'height must be at least 44px');
    assert.match(cls, /min-w-11/, 'width must be at least 44px');
  });
}

test('SpeakButton has a 44px minimum height', () => {
  const source = read('src/components/ui.jsx');
  const tag = source.match(/<button\b[\s\S]*?aria-label=\{label \|\|[\s\S]*?>/)?.[0];
  assert.ok(tag, 'SpeakButton element not found');
  assert.match(tag, /min-h-11/, 'the Listen button must be easily tappable');
});

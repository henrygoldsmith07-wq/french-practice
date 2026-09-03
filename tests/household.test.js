import assert from 'node:assert/strict';
import { test } from 'node:test';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

async function freshStorage() {
  globalThis.localStorage = memoryStorage();
  return import(`../src/lib/storage.js?household=${Date.now()}.${Math.random()}`);
}

test('household starts empty; members validate', async () => {
  const storage = await freshStorage();
  assert.deepEqual(storage.getHousehold(), { members: [], activeId: null });
  assert.equal(storage.getActiveMember(), null);
  assert.equal(storage.addHouseholdMember(''), null);
  assert.equal(storage.addHouseholdMember('   '), null);
  const a = storage.addHouseholdMember('  Amélie  ');
  assert.equal(a.name, 'Amélie');
  assert.equal(storage.getActiveMember().id, a.id);
  assert.equal(storage.addHouseholdMember('amélie'), null); // duplicate
  assert.equal(storage.switchHouseholdMember('nope'), null);
});

test('household caps at six members', async () => {
  const storage = await freshStorage();
  for (let i = 1; i <= 6; i += 1) storage.addHouseholdMember(`Learner ${i}`);
  assert.equal(storage.getHousehold().members.length, 6);
  assert.equal(storage.addHouseholdMember('Learner 7'), null);
});

test('members keep separate streaks', async () => {
  const storage = await freshStorage();
  const a = storage.addHouseholdMember('Ava');
  const b = storage.addHouseholdMember('Ben');
  storage.bumpHouseholdStreak('2026-08-24'); // Ava active: day 1
  storage.bumpHouseholdStreak('2026-08-25'); // Ava active: day 2
  assert.equal(storage.getHousehold().members.find((m) => m.id === a.id).streak.count, 2);
  storage.switchHouseholdMember(b.id);
  storage.bumpHouseholdStreak('2026-08-25'); // Ben: own day 1, same calendar day
  const h = storage.getHousehold();
  assert.equal(h.members.find((m) => m.id === b.id).streak.count, 1);
  assert.equal(h.members.find((m) => m.id === a.id).streak.count, 2);
  // A gap restarts only the gappy member.
  storage.bumpHouseholdStreak('2026-08-30');
  assert.equal(storage.getHousehold().members.find((m) => m.id === b.id).streak.count, 1);
});

test('household carries no comparison data by design', async () => {
  const storage = await freshStorage();
  storage.addHouseholdMember('Ava');
  storage.addHouseholdMember('Ben');
  const h = storage.getHousehold();
  assert.ok(!('standings' in h) && !('rank' in h) && !('totals' in h));
  for (const m of h.members) {
    assert.deepEqual(Object.keys(m).sort(), ['createdAt', 'id', 'name', 'streak']);
  }
});

test('household survives export/import via KEYS', async () => {
  const storage = await freshStorage();
  storage.addHouseholdMember('Ava');
  assert.ok(storage.KEYS.household);
  const exported = storage.exportProgress().data;
  assert.ok(exported[storage.KEYS.household]);
});

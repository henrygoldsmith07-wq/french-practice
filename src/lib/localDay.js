// Local calendar-day identity shared by "Today" surfaces.
//
// Epoch-millisecond division changes day at UTC midnight. The rest of Le Studio
// (streaks, XP days, challenges) rolls over at the learner's local midnight,
// so daily content rotation must use local calendar components too.
//
// Convert the local Y/M/D to a UTC ordinal only AFTER reading those local
// components. The resulting integer advances exactly once per local calendar
// date, including across DST transitions.
export function localDayKey(value = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDayIndex(value = Date.now()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

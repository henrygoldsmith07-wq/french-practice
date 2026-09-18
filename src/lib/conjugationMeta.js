// Conjugation metadata shared by the reference tool, the trainer engine and
// the Today session's gap builder — kept in its own tiny module so consumers
// that only need the person/tense labels (TodaySession) do not pull the full
// conjugation tables (reference.js) into their chunk graph.
// Order matters: person index N ↔ the Nth form of every tense row.

export const PERSONS = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

export const TENSES = [
  { id: 'present', label: 'Présent' },
  { id: 'passe', label: 'Passé composé' },
  { id: 'imparfait', label: 'Imparfait' },
  { id: 'futur', label: 'Futur simple' },
  { id: 'cond', label: 'Conditionnel' },
  { id: 'subj', label: 'Subjonctif' },
];

export const personAt = (i) => PERSONS[i] || null;

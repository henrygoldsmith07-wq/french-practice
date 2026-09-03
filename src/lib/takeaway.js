// Session takeaway — the end-of-session line is what the learner can now
// SAY, not an XP number. Given the conversation turns (each with userText and
// an optional evaluation.native_alternative) plus the scenario, return the
// single French line worth walking away with, or null when there is none.

export function takeawayPhrase(history, scenario) {
  const turns = Array.isArray(history) ? history : [];
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const line = turns[i]?.evaluation?.native_alternative;
    if (typeof line === 'string' && line.trim()) return line.trim();
  }
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const line = turns[i]?.userText;
    if (typeof line === 'string' && line.trim()) return line.trim();
  }
  const opener = scenario?.opener;
  if (typeof opener === 'string' && opener.trim()) return opener.trim();
  return null;
}

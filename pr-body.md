## fix(today): the conjugation drill must feed the model Today reads

The one drill that detects per-verb, per-tense weakness — and reports it to the
learner ("Your trouble spots: subjonctif 61%") — filed its results into a store
no planner reads, so that weakness could never route into Today.

`recordLearningActivity` has no `conjugation` branch and the drill sent no
score, so `applyGap` returned early (a null score) and every answer was
discarded. The conj-drill repair link, which hunts
`conjugation:<verb>:<tense>:<person>`, could only ever be fed by the trainer.

### Changes

- Added the `conjugation` branch to `recordLearningActivity`, deriving the same
  key shape the trainer writes, so a weakness found here is repairable by the
  conj-drill link the planner already hunts. An identity-less event is dropped
  rather than inventing a phantom gap.
- `ConjugationDrill` now supplies a score and item id: 100 correct, 40 for an
  accent slip (the verdict that says "right form, wrong accents" — its own
  error class, honestly scored), 0 otherwise.
- `ConjugationTrainer` records a `near` verdict. It filed NEITHER an error nor
  a success, so a learner whose recurring problem is accents rather than forms
  produced an entry that could never move — no error to route a repair, no
  success to resolve it. The verdict panel already names the mistake; now the
  model does too.
- `Reference` → `ConjugationDrill` now receives `onActivity`, so the drill
  actually reaches the handler.

## fix(household): coins were shared, XP was not

`KEYS.coins` was missing from `LEARNER_KEY_VALUES` while `KEYS.xp` was in it.
Coins are earned with XP (`awardXp` credits both) and spent on avatars, so in a
household the XP bar was per-member and the coin purse was SHARED: one member's
practice funded another member's purchases. Found by the member-switch
regression test.

## fix(rewards): the header showed the previous member after a switch

`useRewards` seeded XP/coins/avatar once with `useState(getXp)` and never
re-read. Switching member in Profile left the header showing the PREVIOUS
member's totals while Profile — which re-reads on every tick — showed the new
member's: two totals on one screen, the wrong one always in the header.

Added `refreshRewards()` and wired it through `Profile` → `useRewards`, so any
surface that changes the active learner re-reads. There is no storage
subscription to rely on, so this must be explicit.

## test(p0): the secret guard now scans the tree

`p0-provider-contract.test.js` hardcoded three source files. When the real
`VITE_*` read moved to `settingsStore.js`, the guard kept passing while
inspecting none of the code that reads the environment — a guard that had
silently stopped guarding. It now walks `src/` (asserting it found >100 files).

## Verification

- `lint:content`, `lint:code`, `lint:tests -- --quiet`: 0 errors
- `npm test`: 1344/1344 pass (6 new regression tests)
- `npm run build`: exit 0, all bundle budgets met

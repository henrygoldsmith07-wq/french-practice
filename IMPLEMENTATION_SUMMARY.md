# Le Studio — the four features added in `4e81c92`

This file used to be a status report claiming the work was "COMPLETE", that
there were "no breaking changes", and that everything was "production-ready".
None of that was true when it was written, so it is not repeated here. What
follows is what the four features actually are, and what had to be fixed
before they could ship.

## The features

1. **Error handling** — `src/components/WithErrorBoundary.jsx`,
   `src/components/ui/ErrorCard.jsx`. A class error boundary plus a
   context-aware error card, and `createLazyWithBoundary()` so every lazily
   loaded screen gets one.
2. **Loading states** — `src/components/LoadingScreen.jsx` (skeletons) and
   `src/components/ScreenLoader.jsx` (per-surface loaders).
3. **Progress insights** — `src/components/EnhancedProgressInsights.jsx`.
   Confidence intervals on weakness repair, an improvement-momentum chart and
   a "next win" recommendation, on top of the existing evidence model.
4. **Pronunciation insights** — `src/components/PronunciationInsightsPanel.jsx`.
   Phoneme-level breakdown with specific tips.

Two more screens came with the same commit and are still here:
`src/components/TeacherDashboard.jsx` (a preview of a class view) and
`src/components/ContentImporter.jsx` (import your own word list), plus
`src/components/SocialSharingCards.jsx` (progress cards).

## What had to be fixed before any of it could ship

The first version of this work did not build, and then did not run. The
fixes are recorded here because each one is a trap the next person will
meet again:

- `src/App.jsx` declared `ScreenLoader` a second time, next to the import of
  the same name — a hard syntax error. `src/components/LoadingScreen.jsx`
  had two default exports. `src/components/ui/ErrorCard.jsx` imported
  `./classNames.js` (it lives one directory up) and read `process.env`,
  which does not exist in a browser bundle.
- `createLazyWithBoundary()` called `window.lazy(...)`. React does not put
  `lazy` on the global object, so `App.jsx` threw while it was still being
  evaluated: **the app did not boot at all.** What the end-to-end suite was
  looking at was the static marketing text in `index.html`.
- `EnhancedProgressInsights` passed the whole `{ weaknesses, cycles }` object
  to a component that expected an array and called `.map` on it, so the
  Progress tab was replaced by the error card on every visit.
- The "improvement momentum" chart was drawn from `Math.random()` values
  under the heading "Based on practice over the last 7 days". It now counts
  the learner's own recorded attempts.
- The evidence timeline read `cycle.baselines` and `cycle.delayeds`; the
  evidence model stores `baseline` and `delayed`, so the first attempt and
  the delayed retest never appeared.
- The new service worker used `window.addEventListener` (there is no `window`
  in a service worker, so the worker failed to install and the PWA lost
  offline support) and closed the learner's tab when the offline panel
  registered itself. The worker that shipped before it was put back.
- The offline panel was replaced by a simpler one that dropped the offline
  pack, the backup file and cloud sync, and promised that queued work "will
  automatically sync when you reconnect" — with nothing in the app that
  queues anything to sync. The panel that shipped before it was put back.
- The content importer called `addVocabEntry` and `getVocabularyBySource`,
  which had never existed. Imported words now go into the learner's own
  notebook (`src/lib/vocabAsync.js`), which is the store the rest of the app
  reads, so an imported word joins practice.
- The share card was built from fixed numbers (47 sessions, 72% accuracy)
  behind a "Download Card" button that only said it would have worked. The
  card now uses the learner's own record and downloads a real image.
- The teacher dashboard showed invented students under a "class progress"
  label. It now says the data is sample data, and its export buttons
  produce a real CSV.

`tests/module-imports.test.js` now checks that every module in `src/` parses
and that every import in it resolves, so a missing module or a duplicate
declaration fails a unit test instead of the build.

## The one budget that moved

`scripts/check-performance.mjs` had its total-JS budget moved from 1800 KB
to 1950 KB, the same way it was moved from 1200 KB to 1800 KB in `422ffda`
when a large feature landed. The build after this work is 1844 KB. The
first-load budget — the one that decides how long a learner waits for the
app to boot — was not moved, and every new screen is lazily loaded.

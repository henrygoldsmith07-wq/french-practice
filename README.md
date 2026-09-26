# Le Studio

An adaptive language-practice studio — **French (Full)** today, with **German**
and **Spanish** in **Beta** — built as a single-page React + Tailwind PWA.
Le Studio is **local-first**: no account is required and learner state lives in
the browser by default. Deployments may optionally enable Google sign-in plus an
encrypted cross-device snapshot service; if that backend is absent or offline,
ordinary learning continues locally. AI features (conversation partner,
corrections, drills) use the learner's own provider key by default; a shared
deployment can instead point the app at an authenticated relay that holds the
provider key server-side.

The product is organised around one idea: **Today**. A learner presses one
button and gets a composed session — listen, speak, repair a weakness, recall —
instead of choosing from a feature catalogue.

## 1. What Le Studio is

Le Studio practices real language use across speaking, listening, reading and
writing, and models what a learner *can do* — not what they have tapped.
The interface is English-first; practice material is in the target language,
always with translations on hand. Core loop: **Today · Speak · Review ·
Learn · Progress** — five tabs, with everything else folded underneath.

## 2. The adaptive Today loop

Today is a single composed session, not a mode picker. A typical plan:
listen to something, hold a short conversation, then a **targeted repair**
segment built from the learner's own error model, then a retrieval step.
Segments are capability-aware (offline → authored drills replace AI drills) and
every segment explains itself: **what you're practising, why it was chosen**
(real evidence: recurring mistakes, due cards), **what success requires**, and
the current recovery state. Learners never see internal ids, engine names or
research vocabulary — copy is test-enforced (`tests/segment-explain.test.js`).

## 3. How learner modelling works

Every scored activity feeds one shared **error model** (`src/lib/learnerErrors.js`,
persisted via `src/lib/stores/learnerErrorStore.js`): a mistake classifies into
a category + key, becomes an *active weakness*, and is prioritised by evidence
strength: recurrence, repeated/cross-mode misses, recency, severity, delayed
recall failure and assistance dependence. A one-off slip stays visible but is
deliberately down-weighted until independent evidence confirms it. The model spans
grammar, vocabulary, listening, pronunciation, speaking, writing and reading —
a weakness found in one mode is repaired by whichever mode best targets it.

Alongside that model, `src/lib/learningEvidence.js` records a learner-facing
effectiveness loop that is deliberately separate from XP and from the opt-in
research study: **baseline weakness → intervention → unseen transfer → delayed
retest**. Repeated submissions of one encounter are deduplicated; assisted
answers contribute less than independent ones; held-out, delayed, difficult and
well-marked evidence carries more weight. Missing transfer or delayed evidence
stays missing rather than being filled with an assumed failure or success.

Separate, deliberately smaller systems: the **mistake graph** (structural
conversation mistakes with a retest ladder), the **weakness memory**
(repair → spaced retest → recurrence), the **phoneme profile** (pronunciation
attempts by sound), and the **FSRS-based SRS** for vocabulary scheduling.
XP, streaks and coins track *activity* and are never inputs to proficiency.

## 4. Speaking / listening / reading / writing

- **Speak** — scenario voice chat with per-turn corrections and scores, a
  fluency mode with a post-session debrief, pronunciation read-aloud scoring,
  shadowing, and a 45-second improv drill. Audio is MediaRecorder + on-device
  analysis; transcription and marking use the AI provider (or mock mode).
- **Listening** — dictée, number drills, authored TTS tracks and provenance-gated
  authentic recordings with comprehension work. The progression runs from slow
  supported speech through verified native, speaker/accent variation,
  spontaneous/noisy speech and explicitly tagged realistic conversation. TTS
  attempts remain useful but are not counted as native-recording evidence. The
  repository currently ships no verified native recording files; genuine pack
  assets require source + licence/consent metadata and may need the network
  unless already cached.
- **Reading** — graded texts, an interactive story, tap-to-translate into a
  personal notebook, comprehension quizzes that feed the error model.
- **Writing** — copy drills, sentence completion, free writing and an essay
  studio with structured AI feedback; every correction seeds a retype task.

## 5. SRS and error recovery

Vocabulary scheduling is **FSRS** (importing legacy SM-2 data), with a
most-forgotten-first, interleaved due queue. Error recovery follows one
documented loop:

> mistake → classify → prioritise → targeted repair → independent success →
> fresh-context transfer → delayed retest → confirmation → recurrence detection

Evidence rules are conservative and tested: **one immediate correct answer
never implies mastery**, repeated submission of one encounter cannot inflate
evidence, assisted success cannot independently demonstrate mastery, and
delayed/fresh-context evidence is stronger than training repetition. A mistake
after repair reactivates the weakness and counts as recurrence. The learner-
facing longitudinal states are **Active weakness → Improving → Needs
confirmation → Demonstrated**, with **Recurred** reopening the cycle.

## 6. Supported languages and maturity

| Language | Maturity | What that means |
|---|---|---|
| 🇫🇷 French | **Full** | Everything: grammar topics, culture, exam boards, learning path |
| 🇩🇪 German | **Beta** | Core loop: Today, conversations, vocabulary, dictée, phrasebook, AI tutor |
| 🇪🇸 Spanish | **Beta** | Core loop, as above |

Language availability comes from ONE authoritative capability matrix
(`src/lib/capabilities.js`): each row (`conversation`, `dictation`,
`reading-library`, `essay-prompts`, `number-listening`, …) lists exactly the
languages whose content actually exists, and every surface — Today, Home,
Learn, Skills, Search, onboarding, deep links, session planning, prefetching —
asks that matrix. The legacy `FULL_ONLY_FEATURES` set (`src/lib/languages.js`)
is now a *derived compatibility API* (French-only feature ids read off the
matrix), not the source of truth. For Beta languages French-authored surfaces
are hidden — not half-working — with honest copy about what *is* available
(`tests/maturity-gating.test.js`, `tests/submode-capabilities.test.js`, and
behavioural coverage in `e2e/beta-languages`/`e2e/beta-submodes` specs).

## 7. Exam support (French)

Timed speaking/writing/listening/reading papers for **WJEC GCSE & A-level**,
**AQA GCSE** and **Edexcel GCSE**, with supervised preparation, real clocks,
band-descriptor marking that leads with time shortfall, and honest grade
handling (indicative band + learner-entered real boundaries). Results feed the
examiner-benchmark validation track.

## 8. AI / privacy architecture

- **Local-first by default.** No account is required. Practice state, SRS,
  learner models and settings remain in browser storage unless the learner
  explicitly exports or syncs them.
- **Bring your own key.** The provider key lives in `localStorage`
  (`fp.groqKey`) via the settings store; it is never exported, and a build-time
  guard (`npm run check:secrets`) fails the build if a provider secret is ever
  exposed through a `VITE_*` variable.
- **Optional relay** for shared hosting: `VITE_GROQ_RELAY_URL` routes AI calls
  through an authenticated server that holds the key (`server/relay.js`).
- **Mock mode** makes the whole studio workable with no key at all.
- **Optional Google account + cloud snapshot.** When `DATABASE_URL`,
  `AUTH_SECRET` and Google OAuth credentials are configured, `/api/auth/*` and
  `/api/sync` can store one portable sync-code snapshot per account. Pushes use
  server-side optimistic concurrency so a stale device cannot silently replace
  a newer snapshot. A passphrase encrypts the snapshot client-side with AES-GCM;
  without a passphrase the snapshot is portable but not end-to-end encrypted.
  Snapshot creation does not mark a backup as successful until the server has
  acknowledged the write; network failures, malformed responses, conflicts and
  oversized snapshots leave local learner state intact.
- **Pulse sharing is opt-in and transcript-free**; turning it off deletes the
  mirror immediately. The evidence study writes only anonymised, local data and
  never enrols without explicit consent.

## 9. Offline / PWA behaviour

Installable PWA with a service worker (network-first, cache-fallback) that
runtime-caches app surfaces and content as they are loaded. Content libraries
are per-language lazy modules/assets, including the French scenario JSON asset.
Previously loaded practice content, SRS, drills and TTS audio work offline;
first-use lazy assets, live AI conversation/marking and uncached remote authentic
audio may need the network. Progress moves
between devices via JSON export/import or an `LS1:` sync code (household
namespacing preserved). Deployments may optionally store that same snapshot
behind Google sign-in; cloud failure never disables local practice. The OS
badge/reminders use the shared live due count (`src/hooks/useStudioBoot.js`).

## 10. Validation and evidence status

Validation tracks (placement, progression, writing/speaking corpus,
comprehension, pronunciation, examiner agreement, real exam results, assistance,
FSRS) report **only real, dated human marks**. Empty tracks read "no-data" —
nothing is invented. Every proportion now carries a **95% Wilson interval**
(`src/lib/evidenceUncertainty.js`), so small samples wear wide intervals rather
than false precision; tracks below their documented floor are "provisional".
Method note: `METHOD_NOTE` in `src/lib/validationStatusReport.js`; live status
via `npm run validation:status`. XP/streaks/activity are reported separately
from proficiency and never mixed into agreement figures. **No external results
are claimed beyond what the dataset contains.**

## 11. Development and testing

```bash
npm install
npm run dev            # local dev server
npm test               # node:test unit suites
npm run lint:content   # copy honesty lint
npm run lint:code      # eslint (react-hooks + no-undef)
npm run type-check     # tsc over critical domain logic
npm run build          # secret guard → vite build → SW versioning → budget gate
npm run validation:status
```

Test counts and bundle sizes are deliberately **not** written here — they
change with every commit and go stale fast. Run the commands above for the
current numbers; the budgets below are the contract, the measured values are
CI's job.

- **Per-push CI** (`.github/workflows/french-practice.yml`): lint, tests,
  type-check, build, size budget, and Playwright E2E on **Chromium + mobile
  Chromium** (fast, single browser install).
- **Scheduled cross-browser CI** (`.github/workflows/cross-browser.yml`): daily
  **Firefox + WebKit** run targeting the risky engine-specific paths
  (MediaRecorder, mic permissions, speech/audio, service worker/PWA, offline,
  Today session, language switching). The config picks its project set from
  `PW_CROSS_BROWSER=1`; `tests/e2e-config-consistency.test.js` pins the
  workflow↔config agreement.
- Playwright config: `playwright.config.js`; E2E specs in `e2e/`.

## 12. Architecture overview

```
src/
  App.jsx                 screen composition + domain wiring: tabs, one
                          overlay reducer, session/activity callbacks,
                          onboarding/settings fan-out
  hooks/                  useStudioBoot (warm-up, reminder, badge, clock),
                          useSessionLifecycle (persist/restore, language
                          switch), useRewards (XP/coins/celebrations),
                          usePwaInstall, useOverlayNav, useScenarios,
                          useAppearance, useTodayDeps
  lib/
    capabilities.js       authoritative language-capability matrix
    storageCore.js        physical layer: key map, learner (household) routing
    storage.js            compat facade over the domain stores
    stores/               domain stores: settings, learnerError, study,
                          seen-lists, research (light/heavy split)
    learnerErrors.js      pure recovery-loop model (evidence-weighted)
    fsrs.js mistakeGraph.js segmentExplain.js content/ ...
  components/             screens + hubs (heavy/detail screens lazy-loaded;
                          lightweight navigation hubs stay in the entry graph)
api/
  auth/                   optional Google OAuth/session routes
  sync.js                 optional account snapshot API with conflict checks
  _lib/                   Postgres/session/Google integration
database/migrations/      optional account/sync schema
server/                   optional authenticated AI relay + quota enforcement
e2e/                      Playwright specs
scripts/                  budget gate, content lint, validation tooling
```

**Store boundaries.** `storageCore.js` is the sanctioned physical layer for
`localStorage`: canonical `fp.*` key map plus transparent per-learner
namespacing (households), lazy claim migration and quota pruning. Product
components never touch browser storage directly — `tests/storage-boundary.test.js`
pins the boundary and keeps every remaining direct access inside storage
infrastructure or a short, documented list of deliberate lib-level exceptions.
Domain stores (`stores/*.js`) own their keys, shapes and caps and never import
the facade (no cycles). `storage.js` remains a facade re-exporting the historical
surface so older imports keep working; contract tests
(`tests/storage-stores.test.js`) pin store↔facade agreement, the key map and
the legacy-data migration.

**Performance budgets** (enforced post-build by `scripts/check-performance.mjs`):
first-load JS (entry + statically imported chunks) **≤ 450 kB**, per-chunk
ceiling 600 kB, 1800 kB total, plus static-closure budgets for **Today, Speak,
Review, Learn and Progress**. The measured sizes are reported by the gate on
every build — never hand-copied here. Beta-language frequency dictionaries are
lazy TSV data assets rather than executable JS, so content volume does not
consume the application-JS budget. Boot prefetching is signal-based
(`src/lib/prefetch.js`): connection quality and the active language decide
what warms up, so early-session transfer stays close to first-load on slow
links and Beta languages never download French-authored chunks. Heavy content
(vocab packs, grammar topics, listening tracks, scenario corpora) is shipped
as per-language lazy chunks and must never enter the boot graph.

## Licence

No repository licence file is currently included. Add an explicit licence before
redistributing Le Studio as an open-source package.
